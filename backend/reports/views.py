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
                },
                "top_cashiers": m["top_cashiers"],
            }
        )

