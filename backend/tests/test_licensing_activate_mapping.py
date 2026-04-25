import pytest
from django.test import override_settings


def _mk_user(username: str, role: str):
    from django.contrib.auth.models import User

    u = User.objects.create_user(username=username, password="pass12345")
    u.profile.role = role
    u.profile.save(update_fields=["role"])
    return u


def _valid_license_row():
    return {
        "id": 1,
        "store_id": 1,
        "store_name": "Store",
        "activation_key": "ACT-1",
        "hardware_id": "22a895c8-47c6-45de-8340-72ec4bdb97a9",
        "license_type": "yearly",
        "is_active": True,
        "computed_status": "active",
        "start_date": "2026-04-25",
        "end_date": None,
    }


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("status_code", "payload", "expected_code"),
    [
        (401, {"detail": "Authentication credentials were not provided."}, "LICENSE_AUTH_INVALID"),
        (403, {"detail": "Invalid X-CLIENT-KEY header."}, "LICENSE_CLIENT_KEY_INVALID"),
        (403, {"detail": "Hardware ID mismatch."}, "LICENSE_HARDWARE_MISMATCH"),
        (404, {"detail": "Invalid activation key."}, "LICENSE_KEY_INVALID"),
        (400, {"detail": "License is not active."}, "LICENSE_NOT_ACTIVE"),
        (429, {"detail": "Too many requests."}, "LICENSE_RATE_LIMITED"),
    ],
)
def test_activate_maps_upstream_errors(client, monkeypatch, status_code, payload, expected_code):
    owner = _mk_user(f"owner_map_{expected_code.lower()}", "OWNER")
    client.force_login(owner)
    monkeypatch.setattr(
        "licensing.views.remote_fetch_admin_licenses_list",
        lambda: (False, payload, status_code),
    )
    r = client.post(
        "/api/licensing/activate/",
        data={"activation_key": "ACT-1", "hardware_id": "HW-1", "client_meta": {"os": "windows"}},
        content_type="application/json",
    )
    assert r.status_code == status_code
    assert r.json()["code"] == expected_code


@pytest.mark.django_db
def test_activate_maps_unreachable_to_502(client, monkeypatch):
    owner = _mk_user("owner_map_unreachable", "OWNER")
    client.force_login(owner)
    monkeypatch.setattr(
        "licensing.views.remote_fetch_admin_licenses_list",
        lambda: (False, "timed out", 0),
    )
    r = client.post(
        "/api/licensing/activate/",
        data={"activation_key": "ACT-1", "hardware_id": "HW-1", "client_meta": {"os": "windows"}},
        content_type="application/json",
    )
    assert r.status_code == 502
    assert r.json()["code"] == "LICENSE_UPSTREAM_UNREACHABLE"


@pytest.mark.django_db
@override_settings(LICENSE_ENFORCEMENT=True)
def test_activate_success_from_admin_list(client, monkeypatch):
    owner = _mk_user("owner_activate_ok", "OWNER")
    client.force_login(owner)
    row = _valid_license_row()
    monkeypatch.setattr(
        "licensing.views.remote_fetch_admin_licenses_list",
        lambda: (True, [row], 200),
    )
    r = client.post(
        "/api/licensing/activate/",
        data={
            "activation_key": "ACT-1",
            "hardware_id": "22a895c8-47c6-45de-8340-72ec4bdb97a9",
            "client_meta": {},
        },
        content_type="application/json",
    )
    assert r.status_code == 200
    body = r.json()
    assert body.get("valid") is True
    assert body.get("expires_at")


@pytest.mark.django_db
def test_activate_key_not_in_list(client, monkeypatch):
    owner = _mk_user("owner_no_key", "OWNER")
    client.force_login(owner)
    monkeypatch.setattr(
        "licensing.views.remote_fetch_admin_licenses_list",
        lambda: (True, [_valid_license_row()], 200),
    )
    r = client.post(
        "/api/licensing/activate/",
        data={"activation_key": "WRONG-KEY", "hardware_id": "22a895c8-47c6-45de-8340-72ec4bdb97a9"},
        content_type="application/json",
    )
    assert r.status_code == 404
    assert r.json()["code"] == "LICENSE_KEY_INVALID"


@pytest.mark.django_db
def test_activate_hardware_mismatch(client, monkeypatch):
    owner = _mk_user("owner_hw_bad", "OWNER")
    client.force_login(owner)
    monkeypatch.setattr(
        "licensing.views.remote_fetch_admin_licenses_list",
        lambda: (True, [_valid_license_row()], 200),
    )
    r = client.post(
        "/api/licensing/activate/",
        data={"activation_key": "ACT-1", "hardware_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"},
        content_type="application/json",
    )
    assert r.status_code == 403
    assert r.json()["code"] == "LICENSE_HARDWARE_MISMATCH"
