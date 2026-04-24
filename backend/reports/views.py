from decimal import Decimal

from django.db.models import Count, DecimalField, ExpressionWrapper, F, Sum
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsAdminOrOwner
from debt.models import Debt
from sales.models import Sale


class DashboardSummaryView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def get(self, request):
        from_date = request.query_params.get("from")
        to_date = request.query_params.get("to")
        today = timezone.localdate()

        sales_qs = Sale.objects.select_related("cashier").all()
        if from_date:
            sales_qs = sales_qs.filter(completed_at__date__gte=from_date)
        if to_date:
            sales_qs = sales_qs.filter(completed_at__date__lte=to_date)

        total_sales_count = sales_qs.count()
        total_sales_amount = sales_qs.aggregate(total=Sum("grand_total"))["total"] or Decimal("0")
        total_discounts = sales_qs.aggregate(total=Sum("discount_total"))["total"] or Decimal("0")
        gross_profit_expr = ExpressionWrapper(
            (F("lines__list_unit_price") - F("lines__purchase_unit_cost")) * F("lines__qty"),
            output_field=DecimalField(max_digits=14, decimal_places=2),
        )
        gross_profit = sales_qs.aggregate(total=Sum(gross_profit_expr))["total"] or Decimal("0")
        today_sales_amount = (
            Sale.objects.filter(completed_at__date=today).aggregate(total=Sum("grand_total"))["total"]
            or Decimal("0")
        )
        void_count = sales_qs.filter(status=Sale.Status.VOIDED).count()
        avg_check = (total_sales_amount / total_sales_count) if total_sales_count else Decimal("0")

        open_debts = Debt.objects.filter(status=Debt.Status.OPEN)
        open_debt_count = open_debts.count()
        open_debt_total = open_debts.aggregate(total=Sum("remaining_amount"))["total"] or Decimal("0")

        top_cashiers = (
            sales_qs.values("cashier__username")
            .annotate(total_sales=Count("id"), total_amount=Sum("grand_total"))
            .order_by("-total_amount")[:5]
        )

        return Response(
            {
                "totals": {
                    "sales_count": total_sales_count,
                    "sales_amount": str(total_sales_amount),
                    "today_sales_amount": str(today_sales_amount),
                    "void_count": void_count,
                    "avg_check": str(avg_check.quantize(Decimal("1"))),
                    "gross_profit": str(gross_profit.quantize(Decimal("1"))),
                    "total_discounts": str(total_discounts.quantize(Decimal("1"))),
                    "open_debt_count": open_debt_count,
                    "open_debt_total": str(open_debt_total),
                },
                "top_cashiers": [
                    {
                        "cashier": row["cashier__username"] or "-",
                        "sales_count": row["total_sales"],
                        "sales_amount": str(row["total_amount"] or Decimal("0")),
                    }
                    for row in top_cashiers
                ],
            }
        )

