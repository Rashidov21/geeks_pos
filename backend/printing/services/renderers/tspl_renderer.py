from __future__ import annotations

from decimal import Decimal
from typing import Any


def _tspl_literal(s: str, *, max_len: int) -> str:
    """ASCII-only single-line text safe inside TSPL double-quoted segments."""
    t = (s or "").replace('"', " ").replace("\r", " ").replace("\n", " ").strip()
    if len(t) > max_len:
        t = t[: max_len].rstrip()
    out = t.encode("ascii", errors="ignore").decode("ascii")
    return out if out else "-"


def _tspl_dimensions_mm(size_key: str) -> tuple[int, int]:
    k = (size_key or "40x30").strip().lower()
    if k == "58mm":
        return 58, 40
    if k == "40x50":
        return 40, 50
    if k == "50x40":
        return 50, 40
    if k == "40x30":
        return 40, 30
    return 40, 30


def _tspl_layout(*, w_mm: int, h_mm: int) -> dict[str, int]:
    """8 dots/mm. Tight vertical stack: brand → model → size/color → barcode (large) → price."""
    h = h_mm * 8
    x0 = 12 if w_mm >= 50 else 8
    if h_mm <= 30:
        return {
            "x": x0,
            # 40x30 is short; keep all blocks compact to avoid big blank gap.
            "brand": 2,
            "model": 16,
            "sc": 32,
            "bc_y": 46,
            "bc_h": 44,
            "nar": 2,
            "wide": 2,
            "price": min(h - 34, 134),
        }
    if h_mm <= 40:
        return {
            "x": x0,
            "brand": 6,
            "model": 26,
            "sc": 52,
            "bc_y": 74,
            "bc_h": 68,
            "nar": 2,
            "wide": 3,
            "price": h - 32,
        }
    # 50 mm tall (40×50)
    return {
        "x": x0,
        "brand": 8,
        "model": 38,
        "sc": 68,
        "bc_y": 98,
        "bc_h": 110,
        "nar": 2,
        "wide": 4,
        "price": h - 36,
    }


class TsplRenderer:
    def __init__(self, *, kind: str):
        self.kind = kind

    def _money(self, value: Any) -> str:
        return f"{Decimal(str(value)).quantize(Decimal('1')):,}".replace(",", " ")

    def render_receipt(self, *, receipt_dto: dict[str, Any], settings) -> bytes:
        # Fallback for unsupported receipt TSPL: emit plain text bytes.
        lines = [
            settings.brand_name,
            str(receipt_dto.get("sale_id", "")),
            self._money(receipt_dto.get("grand_total", 0)),
        ]
        return ("\n".join(lines) + "\n").encode("utf-8", errors="ignore")

    def render_label(self, *, label_payload: dict[str, Any], settings) -> bytes:
        variant = label_payload["variant"]
        size_key = (label_payload.get("size") or "40x30").strip()
        copies = max(1, min(200, int(label_payload.get("copies") or 1)))

        barcode = (variant.barcode or "").strip() or "0"
        cat = ""
        c = getattr(variant.product, "category", None)
        if c is not None:
            cat = (getattr(c, "name_uz", None) or "").strip()
        brand_src = (settings.brand_name or "").strip() or (cat or "")
        brand = _tspl_literal(brand_src, max_len=28)
        model = _tspl_literal((variant.product.name_uz or "").strip(), max_len=32)
        size_color = _tspl_literal(
            f"{variant.size.label_uz} / {variant.color.label_uz}".strip(),
            max_len=36,
        )
        price = _tspl_literal(f"{self._money(variant.list_price)} UZS", max_len=22)

        w_mm, h_mm = _tspl_dimensions_mm(size_key)
        lay = _tspl_layout(w_mm=w_mm, h_mm=h_mm)
        x = lay["x"]

        header = [
            f"SIZE {w_mm} mm,{h_mm} mm",
            "GAP 2 mm,0 mm",
            "DIRECTION 1",
        ]
        blocks: list[str] = []
        for _ in range(copies):
            blocks.extend(
                [
                    "CLS",
                    f'TEXT {x},{lay["brand"]},"2",0,1,1,"{brand}"',
                    f'TEXT {x},{lay["model"]},"2",0,1,1,"{model}"',
                    f'TEXT {x},{lay["sc"]},"2",0,1,1,"{size_color}"',
                    # CODE128, taller bars; human_readable=1 prints digits under barcode (no extra TEXT line)
                    f'BARCODE {x},{lay["bc_y"]},"128",{lay["bc_h"]},1,0,{lay["nar"]},{lay["wide"]},"{barcode}"',
                    f'TEXT {x},{lay["price"]},"2",0,1,1,"{price}"',
                    "PRINT 1,1",
                ]
            )

        tspl = header + blocks
        return ("\r\n".join(tspl) + "\r\n").encode("ascii", errors="ignore")
