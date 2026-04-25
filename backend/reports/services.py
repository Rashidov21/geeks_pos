from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Count, DecimalField, ExpressionWrapper, F, Sum
from django.utils import timezone

from catalog.models import ProductVariant
from debt.models import Debt
from inventory.models import InventoryMovement
from sales.models import Payment, Sale, SaleLine

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
    return_movements = InventoryMovement.objects.filter(type=InventoryMovement.Type.RETURN)
    if from_date:
        return_movements = return_movements.filter(created_at__date__gte=from_date)
    if to_date:
        return_movements = return_movements.filter(created_at__date__lte=to_date)
    returned_count = return_movements.values("ref_sale_id").distinct().count()
    returned_total_raw = Decimal("0")
    movements = list(return_movements.select_related("ref_sale").values("ref_sale_id", "variant_id", "qty_delta"))
    if movements:
        sale_ids = {m["ref_sale_id"] for m in movements if m["ref_sale_id"]}
        line_map: dict[tuple[str, str], Decimal] = {}
        if sale_ids:
            for ln in SaleLine.objects.filter(sale_id__in=sale_ids).values("sale_id", "variant_id", "net_unit_price"):
                line_map[(str(ln["sale_id"]), str(ln["variant_id"]))] = Decimal(str(ln["net_unit_price"] or 0))
        for m in movements:
            sid = m["ref_sale_id"]
            vid = m["variant_id"]
            if not sid or not vid:
                continue
            unit = line_map.get((str(sid), str(vid)), Decimal("0"))
            qty = max(int(m["qty_delta"] or 0), 0)
            returned_total_raw += (unit * Decimal(qty))
    returned_total = q_money(returned_total_raw)

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

    inventory_qs = ProductVariant.objects.filter(deleted_at__isnull=True)
    inventory_items = inventory_qs.aggregate(total=Sum("stock_qty"))["total"] or 0
    inventory_purchase_value = q_money(
        inventory_qs.aggregate(
            total=Sum(
                ExpressionWrapper(
                    F("stock_qty") * F("purchase_price"),
                    output_field=DecimalField(max_digits=16, decimal_places=2),
                )
            )
        )["total"]
    )
    inventory_sale_value = q_money(
        inventory_qs.aggregate(
            total=Sum(
                ExpressionWrapper(
                    F("stock_qty") * F("list_price"),
                    output_field=DecimalField(max_digits=16, decimal_places=2),
                )
            )
        )["total"]
    )

    sold_lines = SaleLine.objects.select_related("variant__product__category", "sale").filter(
        sale__status=Sale.Status.COMPLETED
    )
    if from_date:
        sold_lines = sold_lines.filter(sale__completed_at__date__gte=from_date)
    if to_date:
        sold_lines = sold_lines.filter(sale__completed_at__date__lte=to_date)
    top_products = (
        sold_lines.values("variant__product__name_uz")
        .annotate(total_qty=Sum("qty"), total_sales=Sum("line_total"))
        .order_by("-total_qty")[:5]
    )
    top_brands = (
        sold_lines.values("variant__product__category__name_uz")
        .annotate(total_qty=Sum("qty"), total_sales=Sum("line_total"))
        .order_by("-total_qty")[:5]
    )
    low_products = (
        sold_lines.values("variant__product__name_uz")
        .annotate(total_qty=Sum("qty"))
        .order_by("total_qty")[:5]
    )
    low_brands = (
        sold_lines.values("variant__product__category__name_uz")
        .annotate(total_qty=Sum("qty"))
        .order_by("total_qty")[:5]
    )

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
        "returned_count": returned_count,
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
        "inventory_items": int(inventory_items),
        "inventory_purchase_value": inventory_purchase_value,
        "inventory_sale_value": inventory_sale_value,
        "turnover_amount": sales_amount,
        "net_profit": gross_profit,
        "top_products": [
            {
                "name": row["variant__product__name_uz"] or "-",
                "qty": int(row["total_qty"] or 0),
                "sales_amount": q_money(row["total_sales"]),
            }
            for row in top_products
        ],
        "top_brands": [
            {
                "name": row["variant__product__category__name_uz"] or "-",
                "qty": int(row["total_qty"] or 0),
                "sales_amount": q_money(row["total_sales"]),
            }
            for row in top_brands
        ],
        "low_products": [
            {"name": row["variant__product__name_uz"] or "-", "qty": int(row["total_qty"] or 0)}
            for row in low_products
        ],
        "low_brands": [
            {"name": row["variant__product__category__name_uz"] or "-", "qty": int(row["total_qty"] or 0)}
            for row in low_brands
        ],
    }
