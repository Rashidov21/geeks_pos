from decimal import Decimal, ROUND_HALF_UP
from typing import Any
import time

from django.contrib.auth.models import User
from django.db import IntegrityError, OperationalError, transaction

from catalog.models import ProductVariant
from core.exceptions import (
    DebtPolicyError,
    InsufficientStock,
    InvalidPaymentSplit,
)
from debt.models import Customer, Debt
from inventory.models import InventoryMovement
from inventory.services import apply_movement
from core.audit import log_audit

from .models import Payment, Sale, SaleLine

# UZS/KGS market policy: nearest whole som with HALF_UP.
QUANT = Decimal("1")


def _q(d: Decimal) -> Decimal:
    return d.quantize(QUANT, rounding=ROUND_HALF_UP)


def complete_sale(
    *,
    idempotency_key: str,
    cashier: User,
    lines: list[dict[str, Any]],
    payments: list[dict[str, Any]],
    customer: dict[str, Any] | None,
    order_discount: Decimal | None = None,
    expected_grand_total: Decimal | None = None,
    note: str = "",
) -> Sale:
    if not idempotency_key or len(idempotency_key) > 64:
        raise ValueError("Idempotency-Key required (max 64 chars)")

    existing = Sale.objects.filter(
        idempotency_key=idempotency_key,
        status=Sale.Status.COMPLETED,
    ).first()
    if existing:
        return existing

    if not lines:
        raise ValueError("At least one line required")

    attempts = 3
    for idx in range(attempts):
        try:
            with transaction.atomic():
                sale = _complete_sale_inner(
                    idempotency_key=idempotency_key,
                    cashier=cashier,
                    lines=lines,
                    payments=payments,
                    customer=customer,
                    order_discount=order_discount,
                    expected_grand_total=expected_grand_total,
                    note=note,
                )
                return sale
        except IntegrityError:
            return Sale.objects.get(idempotency_key=idempotency_key)
        except OperationalError as ex:
            msg = str(ex).lower()
            locked = "database is locked" in msg or "database table is locked" in msg
            if (not locked) or idx == attempts - 1:
                raise
            time.sleep(0.08 * (idx + 1))


def _complete_sale_inner(
    *,
    idempotency_key: str,
    cashier: User,
    lines: list[dict[str, Any]],
    payments: list[dict[str, Any]],
    customer: dict[str, Any] | None,
    order_discount: Decimal | None,
    expected_grand_total: Decimal | None,
    note: str,
) -> Sale:
    parsed_lines: list[dict[str, Any]] = []
    subtotal = Decimal("0")
    discount_total = Decimal("0")

    for raw in lines:
        vid = raw["variant_id"]
        qty = int(raw["qty"])
        if qty <= 0:
            raise ValueError("Invalid qty")
        line_discount = _q(Decimal(str(raw.get("line_discount") or "0")))
        if line_discount < 0:
            raise ValueError("line_discount cannot be negative")

        v = (
            ProductVariant.objects.select_related("product", "size", "color")
            .filter(pk=vid, is_active=True, deleted_at__isnull=True)
            .first()
        )
        if not v:
            raise ValueError(f"Variant not found or inactive: {vid}")
        list_price = _q(v.list_price)
        net_unit = _q(list_price - (line_discount / Decimal(qty)))
        if net_unit < 0:
            raise ValueError("Discount exceeds line subtotal")
        line_total = _q(net_unit * Decimal(qty))
        subtotal += _q(list_price * Decimal(qty))
        discount_total += line_discount
        parsed_lines.append(
            {
                "variant": v,
                "qty": qty,
                "list_unit_price": list_price,
                "line_discount": line_discount,
                "net_unit_price": net_unit,
                "purchase_unit_cost": _q(v.purchase_price),
                "line_total": line_total,
            }
        )

    order_discount_amount = _q(Decimal(str(order_discount or "0")))
    if order_discount_amount < 0:
        raise ValueError("order_discount cannot be negative")
    discount_total += order_discount_amount
    grand_total = _q(subtotal - discount_total)
    if grand_total < 0:
        raise InvalidPaymentSplit("Grand total cannot be negative")
    if expected_grand_total is not None and _q(expected_grand_total) != grand_total:
        raise InvalidPaymentSplit("Frontend total mismatch with authoritative backend total")

    pay_sum = Decimal("0")
    debt_amount = Decimal("0")
    parsed_pays: list[dict[str, Any]] = []
    for p in payments:
        method = p["method"]
        amt = _q(Decimal(str(p["amount"])))
        if amt <= 0:
            raise ValueError("Payment amount must be positive")
        pay_sum += amt
        if method == Payment.Method.DEBT:
            debt_amount += amt
        parsed_pays.append({"method": method, "amount": amt})

    if _q(pay_sum) != grand_total:
        raise InvalidPaymentSplit("Payments must equal grand total")

    if debt_amount > 0:
        if not customer:
            raise DebtPolicyError("Customer required for debt payment")
        cust = _resolve_customer(customer)

    sale = Sale.objects.create(
        idempotency_key=idempotency_key,
        cashier=cashier,
        subtotal=_q(subtotal),
        discount_total=_q(discount_total),
        grand_total=_q(grand_total),
        note=note or "",
        status=Sale.Status.COMPLETED,
    )

    for pl in parsed_lines:
        SaleLine.objects.create(
            sale=sale,
            variant=pl["variant"],
            qty=pl["qty"],
            list_unit_price=pl["list_unit_price"],
            line_discount=pl["line_discount"],
            net_unit_price=pl["net_unit_price"],
            purchase_unit_cost=pl["purchase_unit_cost"],
            line_total=pl["line_total"],
        )

    for pl in parsed_lines:
        apply_movement(
            variant=pl["variant"],
            qty_delta=-pl["qty"],
            movement_type=InventoryMovement.Type.SALE,
            user=cashier,
            ref_sale=sale,
            note="POS sale",
        )

    for pp in parsed_pays:
        Payment.objects.create(
            sale=sale,
            method=pp["method"],
            amount=pp["amount"],
        )

    if debt_amount > 0:
        Debt.objects.create(
            customer=cust,
            originating_sale=sale,
            total_amount=_q(debt_amount),
            paid_amount=Decimal("0"),
            remaining_amount=_q(debt_amount),
            due_date=None,
            status=Debt.Status.OPEN,
        )

    log_audit(
        event_type="sale_completed",
        actor=cashier.username,
        entity_id=str(sale.id),
        payload={
            "grand_total": str(sale.grand_total),
            "line_count": len(parsed_lines),
            "payment_count": len(parsed_pays),
        },
    )

    return sale


def _resolve_customer(data: dict[str, Any]) -> Customer:
    if cid := data.get("id"):
        return Customer.objects.get(pk=cid)
    name = data.get("name")
    phone = data.get("phone_normalized")
    if not name or not phone:
        raise DebtPolicyError("Customer name and phone required for debt")
    cust, _ = Customer.objects.get_or_create(
        phone_normalized=phone,
        defaults={"name": name, "note": data.get("note", "")},
    )
    if cust.name != name:
        cust.name = name
        cust.save(update_fields=["name"])
    return cust


@transaction.atomic
def void_sale(*, sale: Sale, user: User, reason: str = "") -> Sale:
    if sale.status == Sale.Status.VOIDED:
        return sale

    sale_lines = SaleLine.objects.select_related("variant").filter(sale=sale)
    for line in sale_lines:
        apply_movement(
            variant=line.variant,
            qty_delta=line.qty,
            movement_type=InventoryMovement.Type.RETURN,
            user=user,
            ref_sale=sale,
            note=f"Void sale restock. {reason}".strip(),
        )

    debt = getattr(sale, "debt_record", None)
    if debt:
        debt.status = Debt.Status.VOIDED
        if debt.paid_amount > debt.total_amount:
            debt.paid_amount = debt.total_amount
        debt.remaining_amount = debt.total_amount - debt.paid_amount
        debt.save(update_fields=["status", "paid_amount", "remaining_amount", "updated_at"])

    sale.status = Sale.Status.VOIDED
    sale.note = f"{sale.note}\nVOID: {reason}".strip() if reason else sale.note
    sale.save(update_fields=["status", "note"])
    log_audit(
        event_type="sale_voided",
        actor=user.username if user else None,
        entity_id=str(sale.id),
        payload={"reason": reason},
    )
    return sale
