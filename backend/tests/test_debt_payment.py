import uuid
from decimal import Decimal

import pytest
from django.contrib.auth.models import User

from catalog.models import Category, Color, Product, ProductVariant, Size
from debt.models import Customer, Debt
from debt.services import record_debt_payment
from sales.models import Payment, Sale
from sales.services import complete_sale


@pytest.fixture
def cashier(db):
    u = User.objects.create_user(username="c2", password="pass12345")
    return u


@pytest.fixture
def customer(db):
    return Customer.objects.create(
        name="Ali", phone_normalized="998901112233", note=""
    )


@pytest.mark.django_db
def test_debt_created_on_debt_payment(cashier, customer):
    cat = Category.objects.create(name_uz="A", name_ru="A")
    sz = Size.objects.create(value="41", label_uz="41", label_ru="41")
    col = Color.objects.create(value="W", label_uz="Oq", label_ru="Белый")
    prod = Product.objects.create(category=cat, name_uz="P", name_ru="P")
    v = ProductVariant(
        product=prod,
        size=sz,
        color=col,
        purchase_price=Decimal("10"),
        list_price=Decimal("100"),
        stock_qty=0,
    )
    v.save()
    from inventory.models import InventoryMovement
    from inventory.services import apply_movement

    apply_movement(
        variant=v,
        qty_delta=10,
        movement_type=InventoryMovement.Type.IN,
        user=cashier,
        note="",
    )
    key = str(uuid.uuid4())
    sale = complete_sale(
        idempotency_key=key,
        cashier=cashier,
        lines=[{"variant_id": str(v.id), "qty": 1, "line_discount": "0"}],
        payments=[
            {"method": "CASH", "amount": "50.00"},
            {"method": "DEBT", "amount": "50.00"},
        ],
        customer={
            "name": customer.name,
            "phone_normalized": customer.phone_normalized,
        },
    )
    d = Debt.objects.get(originating_sale=sale)
    assert d.remaining_amount == Decimal("50.00")
    record_debt_payment(customer=customer, amount=Decimal("20.00"), user=cashier)
    d.refresh_from_db()
    assert d.paid_amount == Decimal("20.00")
    assert d.remaining_amount == Decimal("30.00")
