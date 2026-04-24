import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from reports.services import sales_metrics, q_money

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
            f"Сумма продаж: {_fmt_money(metrics['sales_total'])}\n"
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
        f"Savdo summasi: {_fmt_money(metrics['sales_total'])}\n"
        f"Naqd: {_fmt_money(metrics['cash_total'])}\n"
        f"Karta: {_fmt_money(metrics['card_total'])}\n"
        f"Nasiya: {_fmt_money(metrics['debt_total'])}\n"
        f"Qaytarilgan tovarlar (cheklar): {metrics['returned_count']}\n"
        f"Qaytish summasi: {_fmt_money(metrics['returned_total'])}\n"
        f"Ochiq qarz: {_fmt_money(metrics['open_debt_total'])}"
    )


def _telegram_ready(settings: IntegrationSettings) -> bool:
    return bool(settings.telegram_bot_token and settings.telegram_chat_id)


def _whatsapp_ready(settings: IntegrationSettings) -> bool:
    return bool(settings.whatsapp_api_base and settings.whatsapp_api_token and settings.whatsapp_sender)


def _send_telegram_text(*, settings: IntegrationSettings, text: str):
    if not _telegram_ready(settings):
        raise ValueError("Telegram settings are incomplete")
    ok, details = _post_json(
        f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage",
        {"chat_id": settings.telegram_chat_id, "text": text},
    )
    if not ok:
        raise ValueError(f"Telegram send failed: {details}")
    return details


def _send_whatsapp_text(*, settings: IntegrationSettings, text: str):
    if not _whatsapp_ready(settings):
        raise ValueError("WhatsApp settings are incomplete")
    payload = {"to": settings.whatsapp_sender, "message": text, "sender": settings.whatsapp_sender}
    ok, details = _post_json(
        settings.whatsapp_api_base.rstrip("/") + "/messages/send",
        payload,
        headers={"Authorization": f"Bearer {settings.whatsapp_api_token}"},
    )
    if not ok:
        raise ValueError(f"WhatsApp send failed: {details}")
    return details


def send_daily_z_report(*, lang: str = "uz"):
    return send_z_report_multichannel(lang=lang)


def send_z_report_multichannel(*, lang: str = "uz"):
    settings = IntegrationSettings.get_solo()
    selected_lang = _norm_lang(lang)
    metrics = sales_metrics()
    text = _build_z_report_text(metrics=metrics, lang=selected_lang)

    channel_results: dict[str, dict[str, str | bool]] = {}
    use_telegram = _telegram_ready(settings)
    use_whatsapp = _whatsapp_ready(settings)
    if not use_telegram and not use_whatsapp:
        raise ValueError("No configured notification channels")

    if use_telegram:
        try:
            details = _send_telegram_text(settings=settings, text=text)
            channel_results["telegram"] = {"ok": True, "details": details}
        except ValueError as e:
            channel_results["telegram"] = {"ok": False, "details": str(e)}
    if use_whatsapp:
        try:
            details = _send_whatsapp_text(settings=settings, text=text)
            channel_results["whatsapp"] = {"ok": True, "details": details}
        except ValueError as e:
            channel_results["whatsapp"] = {"ok": False, "details": str(e)}

    ok = any(v.get("ok") for v in channel_results.values())
    details = "Sent successfully" if ok else "All channels failed"
    return {"ok": ok, "details": details, "channel_results": channel_results, "lang": selected_lang}


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

