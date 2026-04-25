import json
from datetime import date, timedelta

from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsAdminOrOwner

from .remote_client import remote_check_status, remote_fetch_admin_licenses_list
from .serializers import LicenseActivateSerializer
from .services import apply_activation_failure, apply_activation_success, get_license_state, status_dict


def _remote_is_active(data: dict) -> bool:
    status = str(data.get("status") or "").strip().lower()
    if status:
        return status == "active"
    valid = data.get("valid")
    if isinstance(valid, bool):
        return valid
    return False


def _remote_error_payload(data: object) -> str:
    if isinstance(data, dict):
        for key in ("detail", "message", "error", "status"):
            val = data.get(key)
            if val:
                return str(val)
        return str(data)
    return str(data)


def _map_activate_error(*, status_code: int, data: object) -> tuple[str, str, int]:
    detail = _remote_error_payload(data)
    lower = detail.lower()

    if status_code == 0:
        return "LICENSE_UPSTREAM_UNREACHABLE", detail, 502
    if status_code == 401:
        return "LICENSE_AUTH_INVALID", detail, 401
    if status_code == 403 and "x-client-key" in lower:
        return "LICENSE_CLIENT_KEY_INVALID", detail, 403
    if status_code == 403 and "hardware id mismatch" in lower:
        return "LICENSE_HARDWARE_MISMATCH", detail, 403
    if status_code == 404 and "activation key" in lower:
        return "LICENSE_KEY_INVALID", detail, 404
    if status_code == 400 and "not active" in lower:
        return "LICENSE_NOT_ACTIVE", detail, 400
    if status_code == 429:
        return "LICENSE_RATE_LIMITED", detail, 429
    return "LICENSE_CHECK_FAILED", detail, status_code


def _map_list_fetch_failure(*, status_code: int, data: object) -> tuple[str, str, int]:
    if status_code == 0:
        d = data if isinstance(data, str) else str(data)
        return "LICENSE_UPSTREAM_UNREACHABLE", d, 502
    if isinstance(data, dict):
        return _map_activate_error(status_code=status_code, data=data)
    return "LICENSE_CHECK_FAILED", str(data), status_code if status_code >= 400 else 502


def _license_row_usable(row: dict) -> bool:
    if row.get("is_active") is False:
        return False
    st = str(row.get("computed_status") or "").strip().lower()
    if st and st != "active":
        return False
    return True


def _expires_at_iso_from_license_row(row: dict) -> str | None:
    end_raw = row.get("end_date")
    if end_raw is not None and str(end_raw).strip():
        d = str(end_raw).strip()[:10]
        if len(d) >= 10 and d[4] == "-" and d[7] == "-":
            return f"{d}T23:59:59"
    start_raw = row.get("start_date")
    if not start_raw or not str(start_raw).strip():
        return None
    try:
        sd = date.fromisoformat(str(start_raw).strip()[:10])
    except ValueError:
        return None
    lt = str(row.get("license_type") or "").strip().lower()
    if lt in ("yearly", "year", ""):
        ed = sd + timedelta(days=365)
        return ed.isoformat() + "T23:59:59"
    return None


class LicenseStatusView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        state = get_license_state()
        activation_key = (state.license_key or "").strip()
        hardware_id = (state.hardware_id or "").strip()
        if activation_key and hardware_id:
            ok, data, status_code = remote_check_status(
                activation_key=activation_key,
                hardware_id=hardware_id,
            )
            if ok and isinstance(data, dict):
                if _remote_is_active(data):
                    expires_at = data.get("expires_at") or data.get("expiry")
                    if expires_at:
                        apply_activation_success(
                            hardware_id=hardware_id,
                            license_key=activation_key,
                            expires_at_iso=str(expires_at),
                            raw_json=json.dumps(data, ensure_ascii=False)[:4000],
                        )
                else:
                    apply_activation_failure(message=str(data.get("status") or data.get("message") or "inactive"))
            elif status_code in (403, 404):
                apply_activation_failure(message=str(data))
        return Response(status_dict())


class LicenseActivateView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def post(self, request):
        ser = LicenseActivateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        hardware_id = ser.validated_data["hardware_id"].strip()
        activation_key = ser.validated_data["activation_key"].strip()

        ok, payload, status_code = remote_fetch_admin_licenses_list()
        if not ok:
            code, detail, response_status = _map_list_fetch_failure(status_code=status_code, data=payload)
            apply_activation_failure(message=detail)
            return Response({"code": code, "detail": detail}, status=response_status)

        rows: list[dict] = payload
        key_want = activation_key.strip()
        hw_want = hardware_id.strip().lower()

        key_hits = [r for r in rows if (str(r.get("activation_key") or "")).strip() == key_want]
        if not key_hits:
            msg = (
                "No matching activation key on the license server. "
                "Ask the project owner to create a license for this device's hardware_id."
            )
            apply_activation_failure(message=msg)
            return Response({"code": "LICENSE_KEY_INVALID", "detail": msg}, status=404)

        row = next(
            (r for r in key_hits if (str(r.get("hardware_id") or "")).strip().lower() == hw_want),
            None,
        )
        if row is None:
            msg = (
                "This activation key is bound to a different hardware_id. "
                "Ask the project owner to issue or reassign a license for this device."
            )
            apply_activation_failure(message=msg)
            return Response({"code": "LICENSE_HARDWARE_MISMATCH", "detail": msg}, status=403)

        if not _license_row_usable(row):
            msg = str(row.get("computed_status") or "License is not active on the license server.")
            apply_activation_failure(message=msg)
            return Response({"code": "LICENSE_NOT_ACTIVE", "detail": msg}, status=400)

        expires_at = _expires_at_iso_from_license_row(row)
        if not expires_at:
            msg = "License server entry is missing dates required to compute expiry."
            apply_activation_failure(message=msg)
            return Response(
                {"code": "LICENSE_RESPONSE_INCOMPLETE", "detail": msg},
                status=502,
            )

        raw = json.dumps(row, ensure_ascii=False)[:4000]
        apply_activation_success(
            hardware_id=hardware_id,
            license_key=activation_key,
            expires_at_iso=expires_at,
            raw_json=raw,
        )
        return Response(status_dict())
