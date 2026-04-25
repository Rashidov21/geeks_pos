from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsAdminOrOwner
from debt.models import Customer

from .models import IntegrationSettings
from .serializers import IntegrationSettingsSerializer
from .services import send_daily_z_report, send_whatsapp_reminder


def _request_lang(request) -> str:
    return (request.headers.get("Accept-Language") or "uz").split(",")[0]


class IntegrationSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def get(self, request):
        obj = IntegrationSettings.get_solo()
        return Response(IntegrationSettingsSerializer(obj).data)

    def put(self, request):
        obj = IntegrationSettings.get_solo()
        ser = IntegrationSettingsSerializer(obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class TelegramZReportSendView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def post(self, request):
        try:
            out = send_daily_z_report(lang=_request_lang(request))
            return Response(out)
        except ValueError as e:
            return Response({"code": "TELEGRAM_SEND_FAILED", "detail": str(e)}, status=400)


class ZReportSendView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def post(self, request):
        try:
            out = send_daily_z_report(lang=_request_lang(request))
            if out.get("ok"):
                return Response(out)
            return Response({"code": "ZREPORT_SEND_FAILED", "detail": out.get("details"), **out}, status=400)
        except ValueError as e:
            return Response({"code": "ZREPORT_SEND_FAILED", "detail": str(e)}, status=400)


class WhatsAppDebtReminderView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def post(self, request):
        customer_id = request.data.get("customer_id")
        if not customer_id:
            return Response({"code": "CUSTOMER_REQUIRED", "detail": "customer_id is required"}, status=400)
        try:
            customer = Customer.objects.get(pk=customer_id)
        except Customer.DoesNotExist:
            return Response({"code": "CUSTOMER_NOT_FOUND", "detail": "Customer not found"}, status=404)
        amount = request.data.get("amount") or "0"
        try:
            out = send_whatsapp_reminder(
                phone=customer.phone_normalized,
                customer_name=customer.name,
                amount=str(amount),
            )
            return Response(out)
        except ValueError as e:
            return Response({"code": "WHATSAPP_SEND_FAILED", "detail": str(e)}, status=400)


@method_decorator(csrf_exempt, name="dispatch")
class NotificationQueueFlushView(APIView):
    """Flush pending outbound notifications (Tauri internal key or authenticated owner)."""

    permission_classes = [AllowAny]
    authentication_classes = [SessionAuthentication]

    def post(self, request):
        from .notification_queue import flush_pending

        internal_key = (getattr(settings, "INTERNAL_FLUSH_KEY", None) or "").strip()
        header = (request.headers.get("X-Internal-Key") or "").strip()
        remote = request.META.get("REMOTE_ADDR") or ""
        localhost = remote in ("127.0.0.1", "::1")
        try:
            limit = int(request.data.get("limit", 50))  # type: ignore[attr-defined]
        except (TypeError, ValueError):
            limit = 50

        if internal_key and header == internal_key:
            if not localhost:
                return Response(
                    {"code": "FORBIDDEN", "detail": "Internal flush is only allowed from localhost."},
                    status=403,
                )
            return Response(flush_pending(limit=limit))

        if not request.user.is_authenticated:
            return Response({"detail": "Authentication credentials were not provided."}, status=401)
        if not IsAdminOrOwner().has_permission(request, self):
            return Response({"detail": "You do not have permission to perform this action."}, status=403)
        return Response(flush_pending(limit=limit))

