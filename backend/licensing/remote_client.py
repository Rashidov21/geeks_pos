"""HTTP client for Owner Dashboard license check."""

from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings


def post_check_status(*, hardware_id: str, license_key: str) -> tuple[bool, dict[str, Any] | str]:
    """
    POST to LICENSE_CHECK_URL. Expected JSON (contract):
      { "valid": bool, "expires_at": "2026-12-31" (ISO date optional), "message": str }
    """
    url = (getattr(settings, "LICENSE_CHECK_URL", None) or "").strip()
    if not url:
        return False, "LICENSE_CHECK_URL is not configured"

    payload = json.dumps({"hardware_id": hardware_id, "license_key": license_key}).encode("utf-8")
    req = Request(url, data=payload, method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        with urlopen(req, timeout=20) as resp:
            body = (resp.read() or b"").decode("utf-8")
    except HTTPError as e:
        return False, f"HTTP {e.code}"
    except URLError as e:
        return False, str(e.reason or e)
    except OSError as e:
        return False, str(e)

    try:
        data = json.loads(body) if body else {}
    except json.JSONDecodeError:
        return False, "Invalid JSON from license server"

    if not isinstance(data, dict):
        return False, "License server returned non-object JSON"

    return True, data
