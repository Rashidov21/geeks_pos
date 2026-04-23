from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsAdminOrOwner, IsCashier
from sales.models import Sale

from .models import StoreSettings
from .receipt import receipt_escpos_bytes, receipt_plain_text, sale_to_receipt_dict
from .serializers import StoreSettingsSerializer


class StoreSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request):
        obj = StoreSettings.get_solo()
        return Response(StoreSettingsSerializer(obj, context={"request": request}).data)

    def put(self, request):
        obj = StoreSettings.get_solo()
        ser = StoreSettingsSerializer(obj, data=request.data, partial=True, context={"request": request})
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class ReceiptPayloadView(APIView):
    permission_classes = [IsAuthenticated, IsCashier]

    def get(self, request, sale_id):
        sale = Sale.objects.prefetch_related("lines__variant__product", "payments").get(
            pk=sale_id
        )
        dto = sale_to_receipt_dict(sale)
        return Response(
            {
                "receipt": dto,
                "plain_text": receipt_plain_text(dto),
                "escpos_base64": None,
            }
        )


class ReceiptEscposView(APIView):
    permission_classes = [IsAuthenticated, IsCashier]

    def get(self, request, sale_id):
        sale = Sale.objects.prefetch_related("lines__variant__product", "payments").get(
            pk=sale_id
        )
        dto = sale_to_receipt_dict(sale)
        raw = receipt_escpos_bytes(dto)
        import base64

        return Response(
            {
                "receipt": dto,
                "escpos_base64": base64.b64encode(raw).decode("ascii"),
            }
        )
