from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsAdminOrOwner
from .services import sales_metrics


class DashboardSummaryView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def get(self, request):
        from_date = request.query_params.get("from")
        to_date = request.query_params.get("to")
        m = sales_metrics(from_date=from_date, to_date=to_date)

        return Response(
            {
                "totals": {
                    "sales_count": m["sales_count"],
                    "sales_amount": str(m["sales_amount"]),
                    "today_sales_amount": str(m["today_sales_amount"]),
                    "void_count": m["void_count"],
                    "avg_check": str(m["avg_check"]),
                    "gross_profit": str(m["gross_profit"]),
                    "total_discounts": str(m["total_discounts"]),
                    "open_debt_count": m["open_debt_count"],
                    "open_debt_total": str(m["open_debt_total"]),
                    "cash_total": str(m["cash_total"]),
                    "card_total": str(m["card_total"]),
                    "debt_total": str(m["debt_total"]),
                    "returned_total": str(m["returned_total"]),
                    "inventory_items": m["inventory_items"],
                    "inventory_purchase_value": str(m["inventory_purchase_value"]),
                    "inventory_sale_value": str(m["inventory_sale_value"]),
                    "turnover_amount": str(m["turnover_amount"]),
                    "net_profit": str(m["net_profit"]),
                },
                "top_cashiers": m["top_cashiers"],
                "top_products": m["top_products"],
                "top_brands": m["top_brands"],
                "low_products": m["low_products"],
                "low_brands": m["low_brands"],
            }
        )

