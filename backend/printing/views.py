from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsAdminOrOwner, IsCashier
from sales.models import Sale

from .models import StoreSettings
from .receipt import receipt_escpos_bytes, receipt_plain_text, sale_to_receipt_dict
from .serializers import StoreSettingsSerializer


def _request_lang(request) -> str:
    return (request.headers.get("Accept-Language") or "uz").split(",")[0]


def _is_admin_or_owner(user) -> bool:
    if getattr(user, "is_superuser", False):
        return True
    profile = getattr(user, "profile", None)
    return getattr(profile, "role", None) in ("ADMIN", "OWNER")


def _has_sale_access(user, sale: Sale) -> bool:
    if _is_admin_or_owner(user):
        return True
    return sale.cashier_id == user.id


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
        sale = Sale.objects.select_related("cashier").prefetch_related("lines__variant__product", "payments").get(
            pk=sale_id
        )
        if not _has_sale_access(request.user, sale):
            return Response(
                {"code": "SALE_ACCESS_DENIED", "detail": "You do not have access to this sale."},
                status=403,
            )
        dto = sale_to_receipt_dict(sale, lang=_request_lang(request))
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
        sale = Sale.objects.select_related("cashier").prefetch_related("lines__variant__product", "payments").get(
            pk=sale_id
        )
        if not _has_sale_access(request.user, sale):
            return Response(
                {"code": "SALE_ACCESS_DENIED", "detail": "You do not have access to this sale."},
                status=403,
            )
        dto = sale_to_receipt_dict(sale, lang=_request_lang(request))
        raw = receipt_escpos_bytes(dto)
        import base64

        return Response(
            {
                "receipt": dto,
                "escpos_base64": base64.b64encode(raw).decode("ascii"),
            }
        )
