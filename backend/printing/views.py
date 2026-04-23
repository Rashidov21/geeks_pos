from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from sales.models import Sale

from .receipt import receipt_escpos_bytes, receipt_plain_text, sale_to_receipt_dict


class ReceiptPayloadView(APIView):
    permission_classes = [IsAuthenticated]

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
    permission_classes = [IsAuthenticated]

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
