/** Empty string = same origin (Vite dev proxy `/api` → Django). */
const API = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

function getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return m ? decodeURIComponent(m[2]) : null
}

export async function fetchCsrf(): Promise<string> {
  const r = await fetch(`${API}/api/auth/csrf/`, { credentials: 'include' })
  const j = await r.json()
  return j.csrfToken as string
}

export async function login(username: string, password: string): Promise<void> {
  const csrf = await fetchCsrf()
  const r = await fetch(`${API}/api/auth/login/`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': csrf,
    },
    body: JSON.stringify({ username, password }),
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(t || 'Login failed')
  }
}

export async function logout(): Promise<void> {
  const csrf = (await fetchCsrf()) || getCookie('csrftoken') || ''
  await fetch(`${API}/api/auth/logout/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRFToken': csrf },
  })
}

export async function fetchVariantByBarcode(code: string) {
  const r = await fetch(
    `${API}/api/catalog/variants/by-barcode/?code=${encodeURIComponent(code)}`,
    { credentials: 'include' },
  )
  if (r.status === 404) {
    const j = await r.json().catch(() => ({}))
    throw Object.assign(new Error('BARCODE_NOT_FOUND'), { code: j.code })
  }
  if (!r.ok) throw new Error('API_ERROR')
  return r.json()
}

export async function completeSale(body: object, idempotencyKey: string) {
  const csrf = (await fetchCsrf()) || getCookie('csrftoken') || ''
  const r = await fetch(`${API}/api/sales/complete/`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': csrf,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    const err = new Error(j.detail || j.code || 'SALE_FAILED') as Error & {
      code?: string
    }
    err.code = j.code
    throw err
  }
  return j
}

export async function fetchReceiptEscpos(saleId: string): Promise<string | null> {
  const r = await fetch(`${API}/api/printing/receipt/${saleId}/escpos/`, {
    credentials: 'include',
  })
  if (!r.ok) return null
  const j = await r.json()
  return j.escpos_base64 as string | null
}

export async function fetchReceiptPlain(saleId: string): Promise<string | null> {
  const r = await fetch(`${API}/api/printing/receipt/${saleId}/`, {
    credentials: 'include',
  })
  if (!r.ok) return null
  const j = await r.json()
  return j.plain_text as string | null
}
