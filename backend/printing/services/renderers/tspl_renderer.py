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
        barcode = (variant.barcode or "").strip() or "0"
        name = _tspl_literal((variant.product.name_uz or "").strip(), max_len=26)
        size_color = _tspl_literal(
            f"{variant.size.label_uz} / {variant.color.label_uz}".strip(),
            max_len=30,
        )
        bc_text = _tspl_literal(barcode, max_len=22)
        price = _tspl_literal(f"{self._money(variant.list_price)} UZS", max_len=20)

        # Stickers are always 40×30 mm. Stack top→bottom: name, size/color, barcode,
        # human-readable number (separate TEXT; BARCODE human_readable=0 avoids overlap),
        # price near bottom. Dots assume ~8 dp/mm (320×240 for 40×30).
        tspl = [
            "SIZE 40 mm,30 mm",
            "GAP 2 mm,0 mm",
            "DIRECTION 1",
            "CLS",
            f'TEXT 8,6,"2",0,1,1,"{name}"',
            f'TEXT 8,28,"2",0,1,1,"{size_color}"',
            f'BARCODE 10,52,"128",32,0,0,2,2,"{barcode}"',
            f'TEXT 8,90,"2",0,1,1,"{bc_text}"',
            f'TEXT 8,208,"2",0,1,1,"{price}"',
            "PRINT 1,1",
        ]
        return ("\r\n".join(tspl) + "\r\n").encode("ascii", errors="ignore")
