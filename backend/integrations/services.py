import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.utils import timezone

from reports.services import sales_metrics, q_money

from .models import IntegrationSettings, NotificationQueue


class NotificationDeliveryError(ValueError):
    def __init__(self, message: str, *, retriable: bool):
        super().__init__(message)
        self.retriable = retriable


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


def _norm_lang(lang: str | None) -> str:
    raw = (lang or "uz").lower()
    return "ru" if raw.startswith("ru") else "uz"


def _fmt_money(value) -> str:
    quantized = q_money(value)
    return f"{quantized:,}".replace(",", " ")


def _build_z_report_text(*, metrics: dict, lang: str) -> str:
    if lang == "ru":
        return (
            f"Z-Report {metrics['date']}\n"
            f"Всего продаж: {metrics['sales_count']}\n"
            f"Сумма продаж: {_fmt_money(metrics['sales_amount'])}\n"
            f"Наличные: {_fmt_money(metrics['cash_total'])}\n"
            f"Карта: {_fmt_money(metrics['card_total'])}\n"
            f"Долг: {_fmt_money(metrics['debt_total'])}\n"
            f"Возвраты (чеков): {metrics['returned_count']}\n"
            f"Сумма возвратов: {_fmt_money(metrics['returned_total'])}\n"
            f"Открытый долг: {_fmt_money(metrics['open_debt_total'])}"
        )
    return (
        f"Z-Report {metrics['date']}\n"
        f"Jami savdo: {metrics['sales_count']}\n"
        f"Savdo summasi: {_fmt_money(metrics['sales_amount'])}\n"
        f"Naqd: {_fmt_money(metrics['cash_total'])}\n"
        f"Karta: {_fmt_money(metrics['card_total'])}\n"
        f"Nasiya: {_fmt_money(metrics['debt_total'])}\n"
        f"Qaytarilgan tovarlar (cheklar): {metrics['returned_count']}\n"
        f"Qaytish summasi: {_fmt_money(metrics['returned_total'])}\n"
        f"Ochiq qarz: {_fmt_money(metrics['open_debt_total'])}"
    )


def _build_z_report_whatsapp_text(*, metrics: dict, lang: str) -> str:
    if lang == "ru":
        return (
            f"*Z-Report* _{metrics['date']}_\n"
            f"- *Продажи:* {metrics['sales_count']}\n"
            f"- *Сумма:* {_fmt_money(metrics['sales_amount'])}\n"
            f"- Наличные: {_fmt_money(metrics['cash_total'])}\n"
            f"- Карта: {_fmt_money(metrics['card_total'])}\n"
            f"- Долг: {_fmt_money(metrics['debt_total'])}\n"
            f"- Возвраты: {metrics['returned_count']} / {_fmt_money(metrics['returned_total'])}\n"
            f"- *Открытый долг:* {_fmt_money(metrics['open_debt_total'])}"
        )
    return (
        f"*Z-Report* _{metrics['date']}_\n"
        f"- *Savdolar:* {metrics['sales_count']}\n"
        f"- *Savdo summasi:* {_fmt_money(metrics['sales_amount'])}\n"
        f"- Naqd: {_fmt_money(metrics['cash_total'])}\n"
        f"- Karta: {_fmt_money(metrics['card_total'])}\n"
        f"- Nasiya: {_fmt_money(metrics['debt_total'])}\n"
        f"- Qaytish: {metrics['returned_count']} / {_fmt_money(metrics['returned_total'])}\n"
        f"- *Ochiq qarz:* {_fmt_money(metrics['open_debt_total'])}"
    )


def _telegram_ready(settings: IntegrationSettings) -> bool:
    return bool(settings.telegram_bot_token and settings.telegram_chat_id)


def _whatsapp_ready(settings: IntegrationSettings) -> bool:
    if settings.whatsapp_provider == IntegrationSettings.WhatsAppProvider.GREEN_API:
        return bool(
            settings.whatsapp_api_base
            and settings.greenapi_instance_id
            and settings.greenapi_api_token_instance
            and settings.whatsapp_sender
        )
    return bool(settings.whatsapp_api_base and settings.whatsapp_api_token and settings.whatsapp_sender)


def _send_telegram_text(*, settings: IntegrationSettings, text: str):
    if not _telegram_ready(settings):
        raise ValueError("Telegram settings are incomplete")
    ok, details = _post_json(
        f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage",
        {"chat_id": settings.telegram_chat_id, "text": text},
    )
    if not ok:
        retriable = "HTTP 4" not in details or "HTTP 429" in details
        raise NotificationDeliveryError(f"Telegram send failed: {details}", retriable=retriable)
    return details


def _send_whatsapp_text(*, settings: IntegrationSettings, text: str):
    if not _whatsapp_ready(settings):
        raise ValueError("WhatsApp settings are incomplete")
    if settings.whatsapp_provider == IntegrationSettings.WhatsAppProvider.GREEN_API:
        chat_id = settings.whatsapp_sender if "@c.us" in settings.whatsapp_sender else f"{settings.whatsapp_sender}@c.us"
        payload = {"chatId": chat_id, "message": text}
        url = (
            settings.whatsapp_api_base.rstrip("/")
            + f"/waInstance{settings.greenapi_instance_id}/sendMessage/{settings.greenapi_api_token_instance}"
        )
        ok, details = _post_json(url, payload)
    else:
        payload = {"to": settings.whatsapp_sender, "message": text, "sender": settings.whatsapp_sender}
        ok, details = _post_json(
            settings.whatsapp_api_base.rstrip("/") + "/messages/send",
            payload,
            headers={"Authorization": f"Bearer {settings.whatsapp_api_token}"},
        )
    if not ok:
        retriable = "HTTP 4" not in details or "HTTP 429" in details
        raise NotificationDeliveryError(f"WhatsApp send failed: {details}", retriable=retriable)
    return details


def _send_whatsapp_debt_reminder_now(
    *,
    settings: IntegrationSettings,
    phone: str,
    customer_name: str,
    amount: str,
):
    if not settings.whatsapp_api_base:
        raise ValueError("WhatsApp settings are incomplete")
    message = f"Assalomu alaykum {customer_name}, qarzingiz: {amount}. Iltimos to'lovni amalga oshiring."
    if settings.whatsapp_provider == IntegrationSettings.WhatsAppProvider.GREEN_API:
        if not settings.greenapi_instance_id or not settings.greenapi_api_token_instance:
            raise ValueError("GreenAPI settings are incomplete")
        chat_id = phone if "@c.us" in phone else f"{phone}@c.us"
        payload = {"chatId": chat_id, "message": message}
        url = (
            settings.whatsapp_api_base.rstrip("/")
            + f"/waInstance{settings.greenapi_instance_id}/sendMessage/{settings.greenapi_api_token_instance}"
        )
        ok, details = _post_json(url, payload)
    else:
        if not settings.whatsapp_api_token:
            raise ValueError("WhatsApp settings are incomplete")
        payload = {"to": phone, "message": message, "sender": settings.whatsapp_sender}
        ok, details = _post_json(
            settings.whatsapp_api_base.rstrip("/") + "/messages/send",
            payload,
            headers={"Authorization": f"Bearer {settings.whatsapp_api_token}"},
        )
    if not ok:
        retriable = "HTTP 4" not in details or "HTTP 429" in details
        raise NotificationDeliveryError(f"WhatsApp send failed: {details}", retriable=retriable)
    return details


def send_daily_z_report(*, lang: str = "uz"):
    today = str(timezone.localdate())
    return send_z_report_multichannel(lang=lang, from_date=today, to_date=today)


def _should_queue_after_telegram_error(exc: Exception) -> bool:
    if isinstance(exc, NotificationDeliveryError):
        return exc.retriable
    msg = str(exc).lower()
    return "incomplete" not in msg


def _should_queue_after_whatsapp_error(exc: Exception) -> bool:
    if isinstance(exc, NotificationDeliveryError):
        return exc.retriable
    msg = str(exc).lower()
    return "incomplete" not in msg and "settings are incomplete" not in msg


def send_z_report_multichannel(*, lang: str = "uz", from_date: str | None = None, to_date: str | None = None):
    from .notification_queue import enqueue

    settings = IntegrationSettings.get_solo()
    selected_lang = _norm_lang(lang)
    metrics = sales_metrics(from_date=from_date, to_date=to_date)
    text_telegram = _build_z_report_text(metrics=metrics, lang=selected_lang)
    text_whatsapp = _build_z_report_whatsapp_text(metrics=metrics, lang=selected_lang)

    channel_results: dict[str, dict[str, str | bool]] = {}
    use_telegram = _telegram_ready(settings)
    use_whatsapp = _whatsapp_ready(settings)
    if not use_telegram and not use_whatsapp:
        raise ValueError("No configured notification channels")

    if use_telegram:
        try:
            details = _send_telegram_text(settings=settings, text=text_telegram)
            channel_results["telegram"] = {"ok": True, "details": details, "queued": False}
        except ValueError as e:
            msg = str(e)
            if _should_queue_after_telegram_error(e):
                enqueue(
                    NotificationQueue.Kind.Z_REPORT_TELEGRAM,
                    {
                        "text": text_telegram,
                        "lang": selected_lang,
                        "from_date": from_date,
                        "to_date": to_date,
                    },
                )
                channel_results["telegram"] = {"ok": True, "details": msg, "queued": True}
            else:
                channel_results["telegram"] = {"ok": False, "details": msg, "queued": False}
    if use_whatsapp:
        try:
            details = _send_whatsapp_text(settings=settings, text=text_whatsapp)
            channel_results["whatsapp"] = {"ok": True, "details": details, "queued": False}
        except ValueError as e:
            msg = str(e)
            if _should_queue_after_whatsapp_error(e):
                enqueue(
                    NotificationQueue.Kind.Z_REPORT_WHATSAPP,
                    {
                        "text": text_whatsapp,
                        "lang": selected_lang,
                        "from_date": from_date,
                        "to_date": to_date,
                    },
                )
                channel_results["whatsapp"] = {"ok": True, "details": msg, "queued": True}
            else:
                channel_results["whatsapp"] = {"ok": False, "details": msg, "queued": False}

    ok = any(v.get("ok") for v in channel_results.values())
    details = "Sent successfully" if ok else "All channels failed"
    return {"ok": ok, "details": details, "channel_results": channel_results, "lang": selected_lang}


def send_whatsapp_reminder(*, phone: str, customer_name: str, amount: str):
    from .notification_queue import enqueue

    settings = IntegrationSettings.get_solo()
    try:
        details = _send_whatsapp_debt_reminder_now(
            settings=settings, phone=phone, customer_name=customer_name, amount=str(amount)
        )
        return {"ok": True, "details": details, "queued": False}
    except ValueError as e:
        msg = str(e)
        if not _should_queue_after_whatsapp_error(e):
            raise
        enqueue(
            NotificationQueue.Kind.WHATSAPP_DEBT_REMINDER,
            {"phone": phone, "customer_name": customer_name, "amount": str(amount)},
        )
        return {"ok": True, "details": msg, "queued": True}


def run_auto_daily_z_report_if_due(*, now=None) -> dict:
    """
    Daily scheduler hook. Sends at most once per local day.
    Returns: {"ran": bool, "reason": str, ...}
    """
    ref_now = now or timezone.localtime()
    today = timezone.localdate()
    settings = IntegrationSettings.get_solo()
    if settings.last_auto_z_report_date == today:
        return {"ran": False, "reason": "already_sent"}
    out = send_daily_z_report(lang="uz")
    settings.last_auto_z_report_date = today
    settings.save(update_fields=["last_auto_z_report_date"])
    return {"ran": True, "reason": "sent", "result": out}
