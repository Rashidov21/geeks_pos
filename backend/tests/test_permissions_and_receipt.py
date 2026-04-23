from decimal import Decimal

import pytest
from django.contrib.auth.models import User

from printing.receipt import round_som, transliterate_uz


def _mk_user(username: str, role: str) -> User:
    u = User.objects.create_user(username=username, password="pass12345")
    u.profile.role = role
    u.profile.save(update_fields=["role"])
    return u


@pytest.mark.django_db
def test_catalog_requires_admin_or_owner(client):
    cashier = _mk_user("cashier_perm", "CASHIER")
    client.force_login(cashier)
    r = client.get("/api/catalog/categories/")
    assert r.status_code == 403


@pytest.mark.django_db
def test_catalog_owner_allowed(client):
    owner = _mk_user("owner_perm", "OWNER")
    client.force_login(owner)
    r = client.get("/api/catalog/categories/")
    assert r.status_code == 200


@pytest.mark.django_db
def test_barcode_endpoint_accessible_to_cashier(client):
    cashier = _mk_user("cashier_barcode", "CASHIER")
    client.force_login(cashier)
    r = client.get("/api/catalog/variants/by-barcode/?code=NOPE")
    # Endpoint can return not-found, but cashier must pass permission layer.
    assert r.status_code != 403


def test_receipt_rounding_and_transliteration():
    assert round_som("10.49") == Decimal("10")
    assert round_som("10.50") == Decimal("11")
    assert transliterate_uz("o‘g‘il bola") == "o'g'il bola"
    assert transliterate_uz("Ғ Ш Ч ў ғ") == "G' Sh Ch o' g'"
