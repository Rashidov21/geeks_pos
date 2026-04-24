from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsAdminOrOwner
from debt.models import Customer

from .models import IntegrationSettings
from .serializers import IntegrationSettingsSerializer
from .services import send_daily_z_report, send_whatsapp_reminder


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
            out = send_daily_z_report()
            return Response(out)
        except ValueError as e:
            return Response({"code": "TELEGRAM_SEND_FAILED", "detail": str(e)}, status=400)


class WhatsAppDebtReminderView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def post(self, request):
        customer_id = request.data.get("customer_id")
        if not customer_id:
            return Response({"code": "CUSTOMER_REQUIRED", "detail": "customer_id is required"}, status=400)
        customer = Customer.objects.get(pk=customer_id)
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

