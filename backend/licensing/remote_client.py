"""HTTP client for Owner Dashboard licensing contract."""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import urlencode, urljoin
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings


def _base_url() -> str:
    return (getattr(settings, "LICENSE_API_BASE_URL", None) or "").strip().rstrip("/") + "/"


def _headers(*, include_json: bool = True) -> dict[str, str]:
    headers: dict[str, str] = {}
    if include_json:
        headers["Content-Type"] = "application/json"
    token = (getattr(settings, "LICENSE_AUTH_TOKEN", None) or "").strip()
    client_key = (getattr(settings, "LICENSE_CLIENT_API_KEY", None) or "").strip()
    if token:
        headers["Authorization"] = f"Token {token}"
    if client_key:
        headers["X-CLIENT-KEY"] = client_key
    return headers


def _decode_json_body(raw: bytes) -> tuple[bool, dict[str, Any] | str]:
    try:
        body = (raw or b"").decode("utf-8")
        data = json.loads(body) if body else {}
    except json.JSONDecodeError:
        return False, "Invalid JSON from license server"
    if not isinstance(data, dict):
        return False, "License server returned non-object JSON"
    return True, data


def remote_activate(
    *, activation_key: str, hardware_id: str, client_meta: dict[str, Any] | None = None
) -> tuple[bool, dict[str, Any] | str, int]:
    base = _base_url()
    if not base:
        return False, "LICENSE_API_BASE_URL is not configured", 0
    url = urljoin(base, "api/v1/activate/")
    payload = {
        "activation_key": activation_key,
        "hardware_id": hardware_id,
        "client_meta": client_meta or {},
    }
    req = Request(url, data=json.dumps(payload).encode("utf-8"), method="POST")
    for k, v in _headers(include_json=True).items():
        req.add_header(k, v)
    try:
        with urlopen(req, timeout=20) as resp:
            status = int(getattr(resp, "status", 200) or 200)
            ok, data = _decode_json_body(resp.read() or b"")
            return ok, data, status
    except HTTPError as e:
        ok, data = _decode_json_body(e.read() or b"")
        return ok, data if ok else f"HTTP {e.code}", int(e.code)
    except URLError as e:
        return False, str(e.reason or e), 0
    except OSError as e:
        return False, str(e), 0


def remote_check_status(*, activation_key: str, hardware_id: str) -> tuple[bool, dict[str, Any] | str, int]:
    base = _base_url()
    if not base:
        return False, "LICENSE_API_BASE_URL is not configured", 0
    query = urlencode({"activation_key": activation_key, "hardware_id": hardware_id})
    url = urljoin(base, "api/v1/check-status/") + f"?{query}"
    req = Request(url, method="GET")
    for k, v in _headers(include_json=False).items():
        req.add_header(k, v)
    try:
        with urlopen(req, timeout=20) as resp:
            status = int(getattr(resp, "status", 200) or 200)
            ok, data = _decode_json_body(resp.read() or b"")
            return ok, data, status
    except HTTPError as e:
        ok, data = _decode_json_body(e.read() or b"")
        return ok, data if ok else f"HTTP {e.code}", int(e.code)
    except URLError as e:
        return False, str(e.reason or e), 0
    except OSError as e:
        return False, str(e), 0


def remote_sync_report(
    *, activation_key: str, hardware_id: str, events: list[dict[str, Any]]
) -> tuple[bool, dict[str, Any] | str, int]:
    base = _base_url()
    if not base:
        return False, "LICENSE_API_BASE_URL is not configured", 0
    url = urljoin(base, "api/v1/sync-report/")
    payload = {
        "activation_key": activation_key,
        "hardware_id": hardware_id,
        "events": events,
    }
    req = Request(url, data=json.dumps(payload).encode("utf-8"), method="POST")
    for k, v in _headers(include_json=True).items():
        req.add_header(k, v)
    try:
        with urlopen(req, timeout=20) as resp:
            status = int(getattr(resp, "status", 200) or 200)
            ok, data = _decode_json_body(resp.read() or b"")
            return ok, data, status
    except HTTPError as e:
        ok, data = _decode_json_body(e.read() or b"")
        return ok, data if ok else f"HTTP {e.code}", int(e.code)
    except URLError as e:
        return False, str(e.reason or e), 0
    except OSError as e:
        return False, str(e), 0
