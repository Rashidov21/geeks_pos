from decimal import Decimal, ROUND_HALF_UP

from escpos.printer import Dummy
from PIL import Image

from .models import StoreSettings


def _normalize_lang(lang: str | None) -> str:
    v = (lang or "uz").lower()
    return "ru" if v.startswith("ru") else "uz"


def _labels(lang: str) -> dict[str, str]:
    if _normalize_lang(lang) == "ru":
        return {
            "tel": "Тел",
            "sale": "Продажа",
            "time": "Время",
            "cashier": "Кассир",
            "subtotal": "Подытог",
            "discount": "Скидка",
            "total": "ИТОГ",
            "footer": "Спасибо!",
            "method.CASH": "Наличные",
            "method.CARD": "Карта",
            "method.DEBT": "Долг",
        }
    return {
        "tel": "Tel",
        "sale": "Savdo",
        "time": "Vaqt",
        "cashier": "Kassir",
        "subtotal": "Oraliq jami",
        "discount": "Chegirma",
        "total": "JAMI",
        "footer": "Rahmat!",
        "method.CASH": "Naqd",
        "method.CARD": "Karta",
        "method.DEBT": "Nasiya",
    }


def round_som(value) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def transliterate_uz(text: str) -> str:
    """CP866 fallback transliteration for Uzbek apostrophe letters."""
    out = text or ""
    apostrophes = ("\u2018", "\u2019", "\u02bb", "\u02bc", "\u201b", "`")
    for ch in apostrophes:
        out = out.replace(f"o{ch}", "o'")
        out = out.replace(f"g{ch}", "g'")
        out = out.replace(f"O{ch}", "O'")
        out = out.replace(f"G{ch}", "G'")

    # Optional Uzbek Cyrillic fallback for old printer encodings.
    cyr_map = {
        "ў": "o'",
        "Ў": "O'",
        "ғ": "g'",
        "Ғ": "G'",
        "ш": "sh",
        "Ш": "Sh",
        "ч": "ch",
        "Ч": "Ch",
    }
    for src, dst in cyr_map.items():
        out = out.replace(src, dst)
    return out


def _line_80mm(left: str, right: str, width: int = 42) -> str:
    left = left[: width - 1]
    right = right[: width - 1]
    spaces = max(1, width - len(left) - len(right))
    return f"{left}{' ' * spaces}{right}"


def _format_amount(v) -> str:
    return str(int(round_som(v)))


def sale_to_receipt_dict(sale, *, lang: str = "uz") -> dict:
    settings = StoreSettings.get_solo()
    lines_out = []
    for line in sale.lines.select_related("variant__product", "variant__size", "variant__color"):
        v = line.variant
        lines_out.append(
            {
                "name": v.product.name_uz,
                "size": v.size.label_uz,
                "color": v.color.label_uz,
                "barcode": v.barcode,
                "qty": line.qty,
                "unit": _format_amount(line.net_unit_price),
                "total": _format_amount(line.line_total),
            }
        )
    pays = [{"method": p.method, "amount": _format_amount(p.amount)} for p in sale.payments.all()]
    return {
        "store": {
            "brand_name": settings.brand_name,
            "phone": settings.phone,
            "address": settings.address,
            "footer_note": settings.footer_note,
            "transliterate_uz": settings.transliterate_uz,
            "encoding": settings.encoding,
            "lang": _normalize_lang(lang),
            "receipt_width": settings.receipt_width or "58mm",
            "receipt_printer_name": settings.receipt_printer_name or "",
            "receipt_printer_type": settings.receipt_printer_type,
            "label_printer_name": settings.label_printer_name or "",
            "label_printer_type": settings.label_printer_type,
        },
        "sale_id": str(sale.id),
        "completed_at": sale.completed_at.isoformat(),
        "cashier": sale.cashier.username,
        "lines": lines_out,
        "subtotal": _format_amount(sale.subtotal),
        "discount_total": _format_amount(sale.discount_total),
        "grand_total": _format_amount(sale.grand_total),
        "payments": pays,
    }


def _normalize_text(text: str, translit: bool) -> str:
    text = text or ""
    if translit:
        text = transliterate_uz(text)
    return text


def receipt_plain_text(receipt: dict) -> str:
    store = receipt.get("store", {})
    translit = bool(store.get("transliterate_uz", True))
    lang = _normalize_lang(store.get("lang", "uz"))
    labels = _labels(lang)

    def t(v: str) -> str:
        return _normalize_text(v, translit)

    buf = []
    buf.append(t(store.get("brand_name", "GEEKS POS")))
    if store.get("address"):
        buf.append(t(store["address"]))
    if store.get("phone"):
        buf.append(f"{labels['tel']}: {t(store['phone'])}")
    width = 42 if store.get("receipt_width") == "80mm" else 32
    buf.append(_line_80mm(labels["sale"], receipt["sale_id"][:8], width=width))
    buf.append(_line_80mm(labels["time"], receipt["completed_at"][:19], width=width))
    buf.append(_line_80mm(labels["cashier"], t(receipt["cashier"]), width=width))
    buf.append("-" * width)

    for ln in receipt["lines"]:
        title = t(f"{ln['name']} {ln['color']} {ln['size']}")
        buf.append(title[:width])
        buf.append(_line_80mm(f"{ln['qty']} x {ln['unit']}", ln["total"], width=width))

    buf.append("-" * width)
    buf.append(_line_80mm(labels["subtotal"], receipt["subtotal"], width=width))
    buf.append(_line_80mm(labels["discount"], receipt["discount_total"], width=width))
    buf.append(_line_80mm(labels["total"], receipt["grand_total"], width=width))
    for p in receipt["payments"]:
        method_label = labels.get(f"method.{p['method']}", p["method"])
        buf.append(_line_80mm(t(method_label), p["amount"], width=width))
    buf.append("-" * width)
    footer = t(store.get("footer_note") or labels["footer"])
    if footer:
        buf.append(footer)
    buf.append("")
    buf.append("--- CUT HERE ---")
    buf.append("")
    return "\n".join(buf)


def _load_logo_bw(settings: StoreSettings):
    if not settings.logo:
        return None
    try:
        img = Image.open(settings.logo.path)
    except Exception:
        return None

    img = img.convert("L")
    threshold = 180
    img = img.point(lambda x: 255 if x > threshold else 0, mode="1")

    max_width = 512
    if img.width > max_width:
        ratio = max_width / float(img.width)
        img = img.resize((max_width, int(img.height * ratio)))
    return img


def receipt_escpos_bytes(receipt: dict) -> bytes:
    settings = StoreSettings.get_solo()

    p = Dummy()
    try:
        p.hw("INIT")
        p.charcode((settings.encoding or "cp866").upper())
    except Exception:
        try:
            p.charcode("CP866")
        except Exception:
            pass

    logo = _load_logo_bw(settings)
    if logo is not None:
        try:
            p.set(align="center")
            p.image(logo)
            p.text("\n")
        except Exception:
            pass

    plain = receipt_plain_text(
        {
            **receipt,
            "store": {
                **receipt.get("store", {}),
                "transliterate_uz": settings.transliterate_uz,
            },
        }
    )

    p.set(align="left")
    p.text(plain)
    try:
        p.cut(mode="PART")
    except Exception:
        p.text("\n\n")
    return p.output


def label_escpos_bytes(*, variant, size: str = "40x30", copies: int = 1) -> bytes:
    settings = StoreSettings.get_solo()
    p = Dummy()
    try:
        p.hw("INIT")
        p.charcode((settings.encoding or "cp866").upper())
    except Exception:
        try:
            p.charcode("CP866")
        except Exception:
            pass

    name = f"{variant.product.name_uz} {variant.size.label_uz} {variant.color.label_uz}"
    price = _format_amount(variant.list_price)
    width = 32 if size == "40x30" else 42
    for _ in range(max(1, int(copies))):
        p.set(align="center", width=2, height=2)
        p.text(f"{settings.brand_name[:width]}\n")
        p.set(align="left", width=1, height=1)
        p.text(f"{name[:width]}\n")
        p.text(f"{variant.barcode}\n")
        p.set(align="center", width=2, height=2)
        p.text(f"{price}\n")
        p.set(align="center")
        # Avoid python-escpos profile warning on Dummy() printers where media.width.pixel is unset.
        p.barcode(variant.barcode or "", "CODE39", height=64, width=2, pos="BELOW", check=False)
        p.text("\n")
    try:
        p.cut(mode="PART")
    except Exception:
        p.text("\n\n")
    return p.output
