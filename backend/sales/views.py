from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.exceptions import (
    DebtPolicyError,
    DomainError,
    InsufficientStock,
    InvalidPaymentSplit,
)
from core.permissions import IsCashier
from printing.receipt import sale_to_receipt_dict

from .serializers import CompleteSaleSerializer
from .services import complete_sale


class CompleteSaleView(APIView):
    permission_classes = [IsAuthenticated, IsCashier]

    def post(self, request):
        key = request.headers.get("Idempotency-Key") or request.data.get(
            "idempotency_key"
        )
        if not key:
            return Response({"code": "IDEMPOTENCY_REQUIRED"}, status=400)
        ser = CompleteSaleSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        try:
            sale = complete_sale(
                idempotency_key=key.strip(),
                cashier=request.user,
                lines=[dict(l) for l in data["lines"]],
                payments=[dict(p) for p in data["payments"]],
                customer=data.get("customer"),
                expected_grand_total=data.get("expected_grand_total"),
                note=data.get("note") or "",
            )
        except InsufficientStock as e:
            return Response({"code": e.code, "detail": str(e)}, status=e.status_code)
        except InvalidPaymentSplit as e:
            return Response({"code": e.code, "detail": str(e)}, status=e.status_code)
        except DebtPolicyError as e:
            return Response({"code": e.code, "detail": str(e)}, status=e.status_code)
        except DomainError as e:
            return Response({"code": e.code, "detail": str(e)}, status=e.status_code)
        except ValueError as e:
            return Response({"code": "VALIDATION_ERROR", "detail": str(e)}, status=400)

        return Response(
            {
                "sale_id": str(sale.id),
                "grand_total": str(sale.grand_total),
                "receipt": sale_to_receipt_dict(sale),
            }
        )


class SaleDetailView(APIView):
    permission_classes = [IsAuthenticated, IsCashier]

    def get(self, request, pk):
        from .models import Sale

        sale = Sale.objects.prefetch_related("lines__variant__product", "payments").get(
            pk=pk
        )
        return Response(
            {
                "sale_id": str(sale.id),
                "receipt": sale_to_receipt_dict(sale),
            }
        )
