from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Count, DecimalField, ExpressionWrapper, F, Q, Sum
from django.utils import timezone

from debt.models import Debt
from sales.models import Payment, Sale

ROUND_UNIT = Decimal("1")


def q_money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(ROUND_UNIT, rounding=ROUND_HALF_UP)


def sales_metrics(*, from_date: str | None = None, to_date: str | None = None):
    completed = Sale.objects.select_related("cashier").filter(status=Sale.Status.COMPLETED)
    voided = Sale.objects.select_related("cashier").filter(status=Sale.Status.VOIDED)
    if from_date:
        completed = completed.filter(completed_at__date__gte=from_date)
        voided = voided.filter(completed_at__date__gte=from_date)
    if to_date:
        completed = completed.filter(completed_at__date__lte=to_date)
        voided = voided.filter(completed_at__date__lte=to_date)

    sales_count = completed.count()
    sales_amount = q_money(completed.aggregate(total=Sum("grand_total"))["total"])
    total_discounts = q_money(completed.aggregate(total=Sum("discount_total"))["total"])

    profit_expr = ExpressionWrapper(
        (F("lines__line_total") - (F("lines__purchase_unit_cost") * F("lines__qty"))),
        output_field=DecimalField(max_digits=14, decimal_places=2),
    )
    gross_profit = q_money(completed.aggregate(total=Sum(profit_expr))["total"])

    today = timezone.localdate()
    today_sales_amount = q_money(
        Sale.objects.filter(status=Sale.Status.COMPLETED, completed_at__date=today).aggregate(total=Sum("grand_total"))[
            "total"
        ]
    )
    avg_check = q_money((sales_amount / sales_count) if sales_count else 0)
    void_count = voided.count()
    returned_total = q_money(voided.aggregate(total=Sum("grand_total"))["total"])

    cash_total = q_money(
        Payment.objects.filter(sale__in=completed, method=Payment.Method.CASH).aggregate(total=Sum("amount"))["total"]
    )
    card_total = q_money(
        Payment.objects.filter(sale__in=completed, method=Payment.Method.CARD).aggregate(total=Sum("amount"))["total"]
    )
    debt_total = q_money(
        Payment.objects.filter(sale__in=completed, method=Payment.Method.DEBT).aggregate(total=Sum("amount"))["total"]
    )

    top_cashiers = (
        completed.values("cashier__username")
        .annotate(total_sales=Count("id"), total_amount=Sum("grand_total"))
        .order_by("-total_amount")[:5]
    )

    open_debts = Debt.objects.filter(status=Debt.Status.OPEN)
    open_debt_count = open_debts.count()
    open_debt_total = q_money(open_debts.aggregate(total=Sum("remaining_amount"))["total"])

    return {
        "sales_count": sales_count,
        "sales_amount": sales_amount,
        "today_sales_amount": today_sales_amount,
        "void_count": void_count,
        "avg_check": avg_check,
        "gross_profit": gross_profit,
        "total_discounts": total_discounts,
        "open_debt_count": open_debt_count,
        "open_debt_total": open_debt_total,
        "returned_count": void_count,
        "returned_total": returned_total,
        "cash_total": cash_total,
        "card_total": card_total,
        "debt_total": debt_total,
        "date": str(today),
        "top_cashiers": [
            {
                "cashier": row["cashier__username"] or "-",
                "sales_count": row["total_sales"],
                "sales_amount": q_money(row["total_amount"]),
            }
            for row in top_cashiers
        ],
    }
