import json
from datetime import datetime
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.db.models import Sum

from debt.models import Debt
from sales.models import Sale

from .models import IntegrationSettings


def _post_json(url: str, payload: dict, headers: dict[str, str] | None = None):
    data = json.dumps(payload).encode("utf-8")
    req = Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    if headers:
        for key, val in headers.items():
            req.add_header(key, val)
    try:
        with urlopen(req, timeout=15) as resp:  # nosec B310 - controlled admin config URL
            body = resp.read().decode("utf-8") if resp else ""
            return True, body
    except HTTPError as e:
        return False, f"HTTP {e.code}"
    except URLError as e:
        return False, str(e.reason)


def send_daily_z_report():
    settings = IntegrationSettings.get_solo()
    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        raise ValueError("Telegram settings are incomplete")

    today = datetime.now().date()
    sales_qs = Sale.objects.filter(completed_at__date=today)
    sales_count = sales_qs.count()
    sales_total = sales_qs.aggregate(total=Sum("grand_total"))["total"] if sales_count else 0
    open_debt_total = Debt.objects.filter(status=Debt.Status.OPEN).aggregate(total=Sum("remaining_amount"))["total"] or 0

    text = (
        f"Z-Report {today.isoformat()}\n"
        f"Sales count: {sales_count}\n"
        f"Sales total: {sales_total}\n"
        f"Open debt total: {open_debt_total}"
    )
    ok, details = _post_json(
        f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage",
        {"chat_id": settings.telegram_chat_id, "text": text},
    )
    if not ok:
        raise ValueError(f"Telegram send failed: {details}")
    return {"ok": True, "details": details}


def send_whatsapp_reminder(*, phone: str, customer_name: str, amount: str):
    settings = IntegrationSettings.get_solo()
    if not settings.whatsapp_api_base or not settings.whatsapp_api_token:
        raise ValueError("WhatsApp settings are incomplete")
    message = f"Assalomu alaykum {customer_name}, qarzingiz: {amount}. Iltimos to'lovni amalga oshiring."
    payload = {"to": phone, "message": message, "sender": settings.whatsapp_sender}
    ok, details = _post_json(
        settings.whatsapp_api_base.rstrip("/") + "/messages/send",
        payload,
        headers={"Authorization": f"Bearer {settings.whatsapp_api_token}"},
    )
    if not ok:
        raise ValueError(f"WhatsApp send failed: {details}")
    return {"ok": True, "details": details}

