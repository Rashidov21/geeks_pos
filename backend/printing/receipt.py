"""Receipt DTO for UI / Tauri ESC-POS or Windows fallback (plain text)."""


def sale_to_receipt_dict(sale) -> dict:
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
                "unit": str(line.net_unit_price),
                "total": str(line.line_total),
            }
        )
    pays = [{"method": p.method, "amount": str(p.amount)} for p in sale.payments.all()]
    return {
        "sale_id": str(sale.id),
        "completed_at": sale.completed_at.isoformat(),
        "cashier": sale.cashier.username,
        "lines": lines_out,
        "subtotal": str(sale.subtotal),
        "discount_total": str(sale.discount_total),
        "grand_total": str(sale.grand_total),
        "payments": pays,
    }


def receipt_plain_text(receipt: dict) -> str:
    """Mode B fallback — Latin-friendly text."""
    buf = []
    buf.append("GEEKS POS")
    buf.append(f"Sale: {receipt['sale_id'][:8]}...")
    buf.append(receipt["completed_at"])
    buf.append(f"Cashier: {receipt['cashier']}")
    buf.append("-" * 32)
    for ln in receipt["lines"]:
        buf.append(f"{ln['name']} {ln['color']} {ln['size']}")
        buf.append(f"  {ln['qty']} x {ln['unit']} = {ln['total']}")
    buf.append("-" * 32)
    buf.append(f"Subtotal: {receipt['subtotal']}")
    buf.append(f"Discount: {receipt['discount_total']}")
    buf.append(f"TOTAL: {receipt['grand_total']}")
    for p in receipt["payments"]:
        buf.append(f"{p['method']}: {p['amount']}")
    buf.append("")
    buf.append("--- CUT HERE ---")
    buf.append("")
    return "\n".join(buf)


def receipt_escpos_bytes(receipt: dict) -> bytes:
    """Minimal ESC/POS: Latin only for MVP reliability."""
    text = receipt_plain_text(receipt)
    # Initialize printer, text mode
    out = bytearray()
    out += b"\x1b\x40"  # init
    out += text.encode("cp437", errors="replace")
    out += b"\n\n\x1dV\x00"  # partial cut (best-effort)
    return bytes(out)
