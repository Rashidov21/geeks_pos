import pytest
from django.contrib.auth.models import User

from debt.models import Customer
from catalog.models import Category, Color, Product, ProductVariant, Size
from decimal import Decimal
from sales.models import Sale


def _mk_user(username: str, role: str) -> User:
    u = User.objects.create_user(username=username, password="pass12345")
    u.profile.role = role
    u.profile.save(update_fields=["role"])
    return u


def _mk_variant(stock_qty: int = 10) -> ProductVariant:
    cat = Category.objects.create(name_uz="Kiyim", name_ru="Одежда")
    sz = Size.objects.create(value="42", label_uz="42", label_ru="42", sort_order=1)
    col = Color.objects.create(value="BLACK-REP", label_uz="Qora", label_ru="Черный", sort_order=1)
    prod = Product.objects.create(category=cat, name_uz="Keta", name_ru="Кеды")
    return ProductVariant.objects.create(
        product=prod,
        size=sz,
        color=col,
        purchase_price=Decimal("100000.00"),
        list_price=Decimal("150000.00"),
        stock_qty=stock_qty,
    )


@pytest.mark.django_db
def test_reports_summary_forbidden_for_cashier(client):
    cashier = _mk_user("cashier_reports", "CASHIER")
    client.force_login(cashier)
    r = client.get("/api/reports/summary/")
    assert r.status_code == 403


@pytest.mark.django_db
def test_inventory_receive_adjust_forbidden_for_cashier(client):
    cashier = _mk_user("cashier_inv", "CASHIER")
    variant = _mk_variant()
    client.force_login(cashier)
    rec = client.post(
        "/api/inventory/receive/",
        data={"variant_id": str(variant.id), "qty": 1},
        content_type="application/json",
    )
    adj = client.post(
        "/api/inventory/adjust/",
        data={"variant_id": str(variant.id), "qty_delta": -1},
        content_type="application/json",
    )
    assert rec.status_code == 403
    assert adj.status_code == 403


@pytest.mark.django_db
def test_reports_summary_allowed_for_owner(client):
    owner = _mk_user("owner_reports", "OWNER")
    client.force_login(owner)
    r = client.get("/api/reports/summary/")
    assert r.status_code == 200
    body = r.json()
    assert "totals" in body
    assert "top_cashiers" in body
    assert "gross_profit" in body["totals"]
    assert "total_discounts" in body["totals"]


@pytest.mark.django_db
def test_order_discount_saved_in_sale(client):
    cashier = _mk_user("cashier_discount", "CASHIER")
    variant = _mk_variant()
    client.force_login(cashier)
    r = client.post(
        "/api/sales/complete/",
        data={
            "lines": [{"variant_id": str(variant.id), "qty": 1, "line_discount": "0"}],
            "payments": [{"method": "CASH", "amount": "140000"}],
            "order_discount": "10000",
            "expected_grand_total": "140000",
        },
        content_type="application/json",
        HTTP_IDEMPOTENCY_KEY="discount-case-1",
    )
    assert r.status_code == 200
    sale = Sale.objects.get(idempotency_key="discount-case-1")
    assert sale.discount_total == Decimal("10000")


@pytest.mark.django_db
def test_integration_settings_owner_allowed(client):
    owner = _mk_user("owner_integ", "OWNER")
    client.force_login(owner)
    r = client.put(
        "/api/integrations/settings/",
        data={
            "telegram_bot_token": "123:abc",
            "telegram_chat_id": "1",
            "whatsapp_api_base": "https://example.org",
            "whatsapp_api_token": "tok",
            "whatsapp_sender": "GEEKS",
        },
        content_type="application/json",
    )
    assert r.status_code == 200
    assert r.json()["telegram_chat_id"] == "1"


@pytest.mark.django_db
def test_integration_actions_owner_allowed_with_stub(client, monkeypatch):
    owner = _mk_user("owner_integ_actions", "OWNER")
    customer = Customer.objects.create(name="Ali", phone_normalized="998901112233")
    client.force_login(owner)

    monkeypatch.setattr(
        "integrations.views.send_daily_z_report",
        lambda: {"ok": True, "details": "ok"},
    )
    monkeypatch.setattr(
        "integrations.views.send_whatsapp_reminder",
        lambda **kwargs: {"ok": True, "details": "ok"},
    )

    z = client.post("/api/integrations/telegram/send-z-report/", data={}, content_type="application/json")
    assert z.status_code == 200

    w = client.post(
        "/api/integrations/whatsapp/remind/",
        data={"customer_id": str(customer.id), "amount": "120000"},
        content_type="application/json",
    )
    assert w.status_code == 200

