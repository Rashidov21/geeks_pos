import json

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsAdminOrOwner

from .remote_client import post_check_status
from .serializers import LicenseActivateSerializer
from .services import apply_activation_failure, apply_activation_success, status_dict


class LicenseStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(status_dict())


class LicenseActivateView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def post(self, request):
        ser = LicenseActivateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        hardware_id = ser.validated_data["hardware_id"].strip()
        license_key = ser.validated_data["license_key"].strip()

        ok, data = post_check_status(hardware_id=hardware_id, license_key=license_key)
        if not ok:
            apply_activation_failure(message=str(data))
            return Response(
                {"code": "LICENSE_CHECK_FAILED", "detail": str(data)},
                status=502,
            )

        if not isinstance(data, dict):
            apply_activation_failure(message="Invalid license server payload")
            return Response(
                {"code": "LICENSE_CHECK_FAILED", "detail": "Invalid license server payload"},
                status=502,
            )

        if not data.get("valid"):
            msg = str(data.get("message") or "License not valid")
            apply_activation_failure(message=msg)
            return Response({"code": "LICENSE_INVALID", "detail": msg}, status=400)

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
            license_key=license_key,
            expires_at_iso=str(expires_at),
            raw_json=raw,
        )
        return Response(status_dict())
