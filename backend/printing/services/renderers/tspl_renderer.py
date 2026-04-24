from __future__ import annotations

from decimal import Decimal
from typing import Any


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
        size = str(label_payload.get("size", "40x30") or "40x30")
        barcode = (variant.barcode or "").strip()
        name = f"{variant.product.name_uz} {variant.size.label_uz} {variant.color.label_uz}"[:32]
        price = self._money(variant.list_price)
        size_cmd = "SIZE 40 mm,30 mm" if size == "40x30" else "SIZE 58 mm,40 mm"

        tspl = [
            size_cmd,
            "GAP 2 mm,0 mm",
            "DIRECTION 1",
            "CLS",
            f'BARCODE 20,40,"128",50,1,0,2,2,"{barcode}"',
            f'TEXT 20,100,"0",0,1,1,"{name}"',
            f'TEXT 20,130,"0",0,1,1,"{price} UZS"',
            "PRINT 1,1",
        ]
        return ("\r\n".join(tspl) + "\r\n").encode("ascii", errors="ignore")
