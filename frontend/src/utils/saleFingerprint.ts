/**
 * Deterministic idempotency input for POST /api/sales/complete/.
 * Backend Sale.idempotency_key max_length=64 — SHA-256 hex fits exactly.
 *
 * `generation` bumps only after a successful complete on the client so two
 * different sales with identical lines/payments still get distinct keys.
 */
export type SaleCompleteLine = { variant_id: string; qty: number; line_discount: string }
export type SaleCompletePayment = { method: string; amount: string }

export function buildCompleteSaleFingerprintInput(opts: {
  generation: number
  lines: SaleCompleteLine[]
  payments: SaleCompletePayment[]
  order_discount: string
  expected_grand_total: string
  debt_due_date: string | null
  customer?: { name: string; phone_normalized: string }
}): string {
  const sortedLines = [...opts.lines]
    .map((l) => ({
      variant_id: l.variant_id,
      qty: l.qty,
      line_discount: l.line_discount,
    }))
    .sort((a, b) => a.variant_id.localeCompare(b.variant_id))

  const sortedPays = [...opts.payments].sort((a, b) => {
    const m = a.method.localeCompare(b.method)
    if (m !== 0) return m
    return a.amount.localeCompare(b.amount)
  })

  const doc = {
    g: opts.generation,
    lines: sortedLines,
    payments: sortedPays,
    od: opts.order_discount,
    egt: opts.expected_grand_total,
    dd: opts.debt_due_date,
    c: opts.customer
      ? { n: opts.customer.name.trim(), p: opts.customer.phone_normalized.trim() }
      : null,
  }

  return JSON.stringify(doc)
}

export async function hashSaleIdempotencyKey64(canonical: string): Promise<string> {
  const data = new TextEncoder().encode(canonical)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(digest)
  let hex = ''
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex.slice(0, 64)
}
