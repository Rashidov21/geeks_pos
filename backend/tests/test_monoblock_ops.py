from decimal import Decimal

import pytest
from django.contrib.auth.models import User

from catalog.models import Category, Color, Product, ProductVariant, Size


def _mk_user(username: str, role: str) -> User:
    u = User.objects.create_user(username=username, password="pass12345")
    u.profile.role = role
    u.profile.save(update_fields=["role"])
    return u


def _mk_variant(stock_qty: int = 10) -> ProductVariant:
    cat = Category.objects.create(name_uz="Kiyim", name_ru="Одежда")
    sz = Size.objects.create(value="42", label_uz="42", label_ru="42", sort_order=1)
    col = Color.objects.create(value="BLACK-MONO", label_uz="Qora", label_ru="Черный", sort_order=1)
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
def test_barcode_lookup_excludes_purchase_price_for_cashier(client):
    cashier = _mk_user("cashier_barcode_hide", "CASHIER")
    variant = _mk_variant()
    variant.barcode = "MONO123"
    variant.save(update_fields=["barcode"])
    client.force_login(cashier)
    r = client.get("/api/catalog/variants/by-barcode/", data={"code": "MONO123"})
    assert r.status_code == 200
    body = r.json()
    assert "purchase_price" not in body
    assert body["list_price"] == "150000.00"


@pytest.mark.django_db
def test_pos_variant_search_for_cashier(client):
    cashier = _mk_user("cashier_search", "CASHIER")
    variant = _mk_variant()
    variant.barcode = "SRCH99"
    variant.save(update_fields=["barcode"])
    client.force_login(cashier)
    r = client.get("/api/catalog/variants/pos-search/", data={"q": "Keta"})
    assert r.status_code == 200
    results = r.json()["results"]
    assert len(results) >= 1
    assert "purchase_price" not in results[0]


@pytest.mark.django_db
def test_pos_variant_by_product_for_cashier(client):
    cashier = _mk_user("cashier_by_prod", "CASHIER")
    variant = _mk_variant()
    client.force_login(cashier)
    r = client.get(
        "/api/catalog/variants/pos-by-product/",
        data={"product_id": str(variant.product_id), "color_id": str(variant.color_id)},
    )
    assert r.status_code == 200
    results = r.json()["results"]
    assert len(results) == 1
    assert "purchase_price" not in results[0]


@pytest.mark.django_db
def test_pos_price_update_allowed_for_cashier(client):
    cashier = _mk_user("cashier_pos_price", "CASHIER")
    variant = _mk_variant()
    client.force_login(cashier)
    r = client.post(
        f"/api/catalog/variants/{variant.id}/pos-price/",
        data={"list_price": "160000"},
        content_type="application/json",
    )
    assert r.status_code == 200
    variant.refresh_from_db()
    assert variant.list_price == Decimal("160000")


@pytest.mark.django_db
def test_label_endpoints_owner_allowed(client):
    owner = _mk_user("owner_label", "OWNER")
    variant = _mk_variant()
    client.force_login(owner)
    single = client.post(
        "/api/printing/labels/escpos/",
        data={"variant_id": str(variant.id), "size": "40x30", "copies": 1},
        content_type="application/json",
    )
    assert single.status_code == 200
    assert "escpos_base64" in single.json()

    queue = client.post(
        "/api/printing/labels/queue/escpos/",
        data={"size": "40x30", "items": [{"variant_id": str(variant.id), "copies": 2}]},
        content_type="application/json",
    )
    assert queue.status_code == 200
    assert len(queue.json()["items"]) == 1


@pytest.mark.django_db
def test_hardware_config_visible_for_cashier(client):
    cashier = _mk_user("cashier_hw_cfg", "CASHIER")
    client.force_login(cashier)
    r = client.get("/api/printing/hardware-config/")
    assert r.status_code == 200
    body = r.json()
    assert "scanner_suffix" in body
    assert "auto_print_on_sale" in body


@pytest.mark.django_db
def test_store_settings_save_hardware_fields_for_owner(client):
    owner = _mk_user("owner_hw_save", "OWNER")
    client.force_login(owner)
    r = client.put(
        "/api/printing/settings/",
        data={
            "receipt_printer_name": "EPSON TM-T20",
            "label_printer_name": "XPrinter XP-365B",
            "receipt_width": "80mm",
            "auto_print_on_sale": True,
            "scanner_mode": "keyboard",
            "scanner_prefix": "",
            "scanner_suffix": "\\t",
        },
        content_type="application/json",
    )
    assert r.status_code == 200
    body = r.json()
    assert body["receipt_printer_name"] == "EPSON TM-T20"
    assert body["receipt_width"] == "80mm"

