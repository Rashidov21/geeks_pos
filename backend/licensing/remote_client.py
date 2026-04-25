"""HTTP client for Owner Dashboard licensing contract."""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import urlencode, urljoin, urlparse
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


ADMIN_LICENSES_PAGE_LIMIT = 1000


def remote_fetch_admin_licenses_list() -> tuple[bool, list[dict[str, Any]] | str, int]:
    """
    GET /api/v1/admin/licenses/?limit=1000&offset=0 (and follow ``next``) using the same
    Token + X-CLIENT-KEY headers as other license server calls.
    """
    base = _base_url()
    if not base:
        return False, "LICENSE_API_BASE_URL is not configured", 0
    query = urlencode({"limit": ADMIN_LICENSES_PAGE_LIMIT, "offset": 0})
    url: str | None = urljoin(base, f"api/v1/admin/licenses/?{query}")
    aggregated: list[dict[str, Any]] = []
    pages = 0
    max_pages = 200
    while url:
        pages += 1
        if pages > max_pages:
            return False, "License server admin list pagination exceeded safe limit", 502
        req = Request(url, method="GET")
        for k, v in _headers(include_json=False).items():
            req.add_header(k, v)
        try:
            with urlopen(req, timeout=30) as resp:
                status = int(getattr(resp, "status", 200) or 200)
                ok, data = _decode_json_body(resp.read() or b"")
                if not ok:
                    return False, data if isinstance(data, str) else "Invalid JSON from license server", status
                if not isinstance(data, dict):
                    return False, "License server returned non-object JSON", status
                results = data.get("results")
                if not isinstance(results, list):
                    return False, "Invalid license server payload (results)", status
                aggregated.extend([r for r in results if isinstance(r, dict)])
                nxt = data.get("next")
                if nxt and isinstance(nxt, str) and nxt.strip():
                    nxt = nxt.strip()
                    if nxt.startswith("http://") or nxt.startswith("https://"):
                        url = nxt
                    else:
                        url = urljoin(base, nxt.lstrip("/"))
                    base_host = urlparse(base).netloc
                    if urlparse(url).netloc and urlparse(url).netloc != base_host:
                        return False, "License server returned unexpected next URL", status
                else:
                    url = None
        except HTTPError as e:
            dec_ok, data = _decode_json_body(e.read() or b"")
            if dec_ok and isinstance(data, dict):
                return False, data, int(e.code)
            return False, f"HTTP {e.code}", int(e.code)
        except URLError as e:
            return False, str(e.reason or e), 0
        except OSError as e:
            return False, str(e), 0
    return True, aggregated, 200


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
