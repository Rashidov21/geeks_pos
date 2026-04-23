from decimal import Decimal

from django.db import transaction

from .models import Customer, Debt


@transaction.atomic
def record_debt_payment(
    *,
    customer: Customer,
    amount: Decimal,
    user,
) -> list[Debt]:
    """
    Apply payment FIFO across OPEN debts (oldest due_date, then created_at).
    """
    if amount <= 0:
        raise ValueError("amount must be positive")

    remaining_pay = amount
    touched: list[Debt] = []
    qs = Debt.objects.filter(customer=customer, status=Debt.Status.OPEN).order_by(
        "due_date", "created_at"
    )
    for debt in qs:
        if remaining_pay <= 0:
            break
        pay_to = min(remaining_pay, debt.remaining_amount)
        debt.paid_amount += pay_to
        debt.remaining_amount -= pay_to
        remaining_pay -= pay_to
        if debt.remaining_amount == 0:
            debt.status = Debt.Status.PAID
        debt.save(update_fields=["paid_amount", "remaining_amount", "status", "updated_at"])
        touched.append(debt)

    if remaining_pay > 0:
        from core.exceptions import DebtPolicyError

        raise DebtPolicyError("Payment exceeds total open debt")

    return touched
