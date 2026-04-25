import json

from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsAdminOrOwner

from .remote_client import remote_activate, remote_check_status
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
        client_meta = ser.validated_data.get("client_meta") or {}

        ok, data, status_code = remote_activate(
            activation_key=activation_key,
            hardware_id=hardware_id,
            client_meta=client_meta,
        )
        if not ok:
            apply_activation_failure(message=str(data))
            return Response(
                {"code": "LICENSE_CHECK_FAILED", "detail": str(data)},
                status=502 if status_code == 0 else status_code,
            )

        if not isinstance(data, dict):
            apply_activation_failure(message="Invalid license server payload")
            return Response(
                {"code": "LICENSE_CHECK_FAILED", "detail": "Invalid license server payload"},
                status=502,
            )

        if not _remote_is_active(data):
            msg = str(data.get("message") or data.get("status") or "License not active")
            apply_activation_failure(message=msg)
            return Response({"code": "LICENSE_INVALID", "detail": msg}, status=400 if status_code < 400 else status_code)

        expires_at = data.get("expires_at") or data.get("expiry")
        if not expires_at:
            apply_activation_failure(message="Missing expires_at in license server response")
            return Response(
                {"code": "LICENSE_RESPONSE_INCOMPLETE", "detail": "Server did not return expires_at"},
                status=502,
            )

        raw = json.dumps(data, ensure_ascii=False)[:4000]
        apply_activation_success(
            hardware_id=hardware_id,
            license_key=activation_key,
            expires_at_iso=str(expires_at),
            raw_json=raw,
        )
        return Response(status_dict())
