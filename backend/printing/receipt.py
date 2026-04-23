from decimal import Decimal, ROUND_HALF_UP

from escpos.printer import Dummy
from PIL import Image

from .models import StoreSettings


def round_som(value) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def transliterate_uz(text: str) -> str:
    """CP866 fallback transliteration for Uzbek apostrophe letters."""
    mapping = {
        "o\u2018": "o'",
        "o\u2019": "o'",
        "o\u02bb": "o'",
        "o\u02bc": "o'",
        "o\u02bb": "o'",
        "o\u201b": "o'",
        "o\u02bc": "o'",
        "o\u02bb": "o'",
        "o\u02bb": "o'",
        "o\u2018": "o'",
        "o\u2019": "o'",
        "o\u02bb": "o'",
        "o\u02bc": "o'",
        "o\u02bb": "o'",
        "o\u02bc": "o'",
        "o\u02bb": "o'",
        "g\u2018": "g'",
        "g\u2019": "g'",
        "g\u02bb": "g'",
        "g\u02bc": "g'",
        "O\u2018": "O'",
        "O\u2019": "O'",
        "O\u02bb": "O'",
        "O\u02bc": "O'",
        "G\u2018": "G'",
        "G\u2019": "G'",
        "G\u02bb": "G'",
        "G\u02bc": "G'",
    }
    out = text or ""
    for src, dst in mapping.items():
        out = out.replace(src, dst)
    return out


def _line_80mm(left: str, right: str, width: int = 42) -> str:
    left = left[: width - 1]
    right = right[: width - 1]
    spaces = max(1, width - len(left) - len(right))
    return f"{left}{' ' * spaces}{right}"


def _format_amount(v) -> str:
    return str(int(round_som(v)))


def sale_to_receipt_dict(sale) -> dict:
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

    def t(v: str) -> str:
        return _normalize_text(v, translit)

    buf = []
    buf.append(t(store.get("brand_name", "GEEKS POS")))
    if store.get("address"):
        buf.append(t(store["address"]))
    if store.get("phone"):
        buf.append(f"Tel: {t(store['phone'])}")
    buf.append(_line_80mm("Sale", receipt["sale_id"][:8]))
    buf.append(_line_80mm("Time", receipt["completed_at"][:19]))
    buf.append(_line_80mm("Cashier", t(receipt["cashier"])))
    buf.append("-" * 42)

    for ln in receipt["lines"]:
        title = t(f"{ln['name']} {ln['color']} {ln['size']}")
        buf.append(title[:42])
        buf.append(_line_80mm(f"{ln['qty']} x {ln['unit']}", ln["total"]))

    buf.append("-" * 42)
    buf.append(_line_80mm("Subtotal", receipt["subtotal"]))
    buf.append(_line_80mm("Discount", receipt["discount_total"]))
    buf.append(_line_80mm("TOTAL", receipt["grand_total"]))
    for p in receipt["payments"]:
        buf.append(_line_80mm(t(p["method"]), p["amount"]))
    buf.append("-" * 42)
    footer = t(store.get("footer_note") or "Rahmat!")
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
