import json
from datetime import date, timedelta

from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsAdminOrOwner

from .remote_client import remote_activate, remote_check_status, remote_verify_activation_key
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
    if status_code == 403 and (
        "hardware id mismatch" in lower
        or ("hardware" in lower and ("mismatch" in lower or "bound" in lower or "different" in lower))
    ):
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


def _expires_at_iso_from_remote_dict(data: dict) -> str | None:
    for key in ("expires_at", "expiry", "end_date"):
        v = data.get(key)
        if not v:
            continue
        s = str(v).strip()
        if len(s) >= 10 and s[4] == "-" and s[7] == "-":
            return f"{s[:10]}T23:59:59" if len(s) == 10 else s

    st = str(data.get("status") or "").strip().lower()
    if st != "active":
        return None
    lt = str(data.get("license_type") or "").strip().lower()
    if lt in ("lifetime", "unlimited", "perpetual"):
        return "2099-12-31T23:59:59"
    start = data.get("start_date")
    if start and lt in ("yearly", "year", "annual"):
        try:
            d0 = date.fromisoformat(str(start).strip()[:10])
        except ValueError:
            d0 = None
        if d0:
            try:
                end = d0.replace(year=d0.year + 1)
            except ValueError:
                end = d0 + timedelta(days=365)
            return f"{end.isoformat()}T23:59:59"
    return None


def _verify_payload_allows_activation(data: dict) -> tuple[bool, str | None]:
    """After HTTP 2xx + JSON from verify-activation-key: may we call activate?"""
    st = str(data.get("status") or "").strip().lower()
    if not st:
        return True, None
    if st == "active":
        return True, None
    return False, str(data.get("detail") or data.get("message") or st)


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
                    st = str(data.get("status") or "").strip().lower()
                    apply_activation_failure(
                        message=str(data.get("message") or data.get("detail") or st or "inactive")
                    )
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
        client_meta = ser.validated_data.get("client_meta")
        if not isinstance(client_meta, dict):
            client_meta = {}

        ok_v, payload_v, st_v = remote_verify_activation_key(activation_key=activation_key)
        if st_v == 0 or not ok_v:
            code, detail, response_status = _map_list_fetch_failure(status_code=st_v, data=payload_v)
            apply_activation_failure(message=detail)
            return Response({"code": code, "detail": detail}, status=response_status)

        if not isinstance(payload_v, dict):
            code, detail, response_status = _map_list_fetch_failure(status_code=st_v, data=payload_v)
            apply_activation_failure(message=detail)
            return Response({"code": code, "detail": detail}, status=response_status)

        if st_v >= 400:
            code, detail, response_status = _map_activate_error(status_code=st_v, data=payload_v)
            apply_activation_failure(message=detail)
            return Response({"code": code, "detail": detail}, status=response_status)

        allow, reason = _verify_payload_allows_activation(payload_v)
        if not allow:
            apply_activation_failure(message=reason or "inactive")
            return Response(
                {"code": "LICENSE_NOT_ACTIVE", "detail": reason or "License is not active."},
                status=400,
            )

        ok_a, payload_a, st_a = remote_activate(
            activation_key=activation_key,
            hardware_id=hardware_id,
            client_meta=client_meta,
        )
        if st_a == 0 or not ok_a:
            code, detail, response_status = _map_list_fetch_failure(status_code=st_a, data=payload_a)
            apply_activation_failure(message=detail)
            return Response({"code": code, "detail": detail}, status=response_status)

        if not isinstance(payload_a, dict):
            code, detail, response_status = _map_list_fetch_failure(status_code=st_a, data=payload_a)
            apply_activation_failure(message=detail)
            return Response({"code": code, "detail": detail}, status=response_status)

        if st_a >= 400:
            code, detail, response_status = _map_activate_error(status_code=st_a, data=payload_a)
            apply_activation_failure(message=detail)
            return Response({"code": code, "detail": detail}, status=response_status)

        expires_at = _expires_at_iso_from_remote_dict(payload_a) or _expires_at_iso_from_remote_dict(payload_v)
        if not expires_at:
            msg = "License server did not return expiry (expires_at / expiry / end_date)."
            apply_activation_failure(message=msg)
            return Response({"code": "LICENSE_RESPONSE_INCOMPLETE", "detail": msg}, status=502)

        raw = json.dumps({"verify": payload_v, "activate": payload_a}, ensure_ascii=False)[:4000]
        apply_activation_success(
            hardware_id=hardware_id,
            license_key=activation_key,
            expires_at_iso=expires_at,
            raw_json=raw,
        )
        return Response(status_dict())
