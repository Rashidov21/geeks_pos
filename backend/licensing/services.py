from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from django.conf import settings
from django.utils import timezone

from .crypto import decrypt_expiry_iso, encrypt_expiry_iso
from .models import LicenseState


def enforcement_enabled() -> bool:
    return bool(getattr(settings, "LICENSE_ENFORCEMENT", False))


def get_license_state() -> LicenseState:
    return LicenseState.get_solo()


def _parse_expiry_iso(iso: str) -> datetime | None:
    raw = (iso or "").strip()
    if not raw:
        return None
    if len(raw) == 10 and raw[4] == "-" and raw[7] == "-":
        raw = raw + "T23:59:59"
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def is_license_valid_for_use() -> bool:
    if not enforcement_enabled():
        return True

    state = get_license_state()
    hw = (state.hardware_id or "").strip()
    if not hw or not state.expiry_ciphertext:
        return False

    plain = decrypt_expiry_iso(hardware_id=hw, ciphertext=bytes(state.expiry_ciphertext))
    if not plain:
        return False

    expires_at = _parse_expiry_iso(plain)
    if not expires_at:
        return False

    now = timezone.now()
    if expires_at >= now:
        return True

    # Soft renewal window: allow briefly after stored expiry if a recent remote check succeeded.
    grace_hours = int(getattr(settings, "LICENSE_OFFLINE_GRACE_HOURS", 0) or 0)
    if grace_hours > 0 and state.last_valid_remote_at and state.last_check_ok:
        grace_end = state.last_valid_remote_at + timedelta(hours=grace_hours)
        if grace_end >= now:
            return True

    return False


def mask_license_key(key: str) -> str:
    k = (key or "").strip()
    if len(k) <= 6:
        return "***" if k else ""
    return f"{k[:3]}…{k[-3:]}"


def apply_activation_success(
    *,
    hardware_id: str,
    license_key: str,
    expires_at_iso: str,
    raw_json: str = "",
) -> LicenseState:
    state = get_license_state()
    state.hardware_id = hardware_id.strip()[:128]
    state.license_key = license_key.strip()[:255]
    ct = encrypt_expiry_iso(hardware_id=state.hardware_id, expires_at_iso=expires_at_iso.strip())
    state.expiry_ciphertext = ct
    state.last_check_at = timezone.now()
    state.last_check_ok = True
    state.last_check_message = "ok"
    state.last_valid_remote_at = timezone.now()
    state.raw_status_json = (raw_json or "")[:4000]
    state.save()
    return state


def apply_activation_failure(*, message: str) -> LicenseState:
    state = get_license_state()
    state.last_check_at = timezone.now()
    state.last_check_ok = False
    state.last_check_message = (message or "")[:500]
    state.save()
    return state


def status_dict() -> dict[str, Any]:
    if not enforcement_enabled():
        return {
            "enforcement": False,
            "valid": True,
            "license_key_masked": "",
            "expires_at": None,
            "last_check_ok": True,
            "last_check_message": "License enforcement disabled",
        }

    state = get_license_state()
    hw = (state.hardware_id or "").strip()
    masked = mask_license_key(state.license_key)
    expires_at: str | None = None
    if hw and state.expiry_ciphertext:
        plain = decrypt_expiry_iso(hardware_id=hw, ciphertext=bytes(state.expiry_ciphertext))
        if plain:
            expires_at = plain[:10] if len(plain) >= 10 else plain

    return {
        "enforcement": True,
        "valid": is_license_valid_for_use(),
        "license_key_masked": masked,
        "expires_at": expires_at,
        "last_check_ok": state.last_check_ok,
        "last_check_message": state.last_check_message,
        "hardware_id_set": bool(hw),
    }
