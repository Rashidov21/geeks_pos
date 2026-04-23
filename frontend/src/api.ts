/** Empty string = same origin (Vite dev proxy `/api` → Django). */
const API = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

export class AppError extends Error {
  code: string
  detail?: string
  constructor(code: string, detail?: string) {
    super(code)
    this.code = code
    this.detail = detail
  }
}

function getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return m ? decodeURIComponent(m[2]) : null
}

async function parseErrorResponse(r: Response, fallbackCode: string): Promise<AppError> {
  const j = (await r.json().catch(() => ({}))) as { code?: string; detail?: string }
  return new AppError(j.code || fallbackCode, j.detail)
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
    throw await parseErrorResponse(r, 'INVALID_CREDENTIALS')
  }
  await r.json().catch(() => ({}))
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
    throw await parseErrorResponse(r, 'BARCODE_NOT_FOUND')
  }
  if (!r.ok) throw await parseErrorResponse(r, 'API_ERROR')
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
    throw new AppError(j.code || 'SALE_FAILED', j.detail)
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

export type UserRole = 'CASHIER' | 'ADMIN' | 'OWNER'

export type MeResponse = {
  username: string
  role: UserRole
}

function normalizeRole(role: unknown): UserRole {
  const raw = typeof role === 'string' ? role.toUpperCase() : ''
  // Accept strict values and enum-like values such as "Role.OWNER".
  if (raw === 'ADMIN' || raw.endsWith('.ADMIN')) return 'ADMIN'
  if (raw === 'OWNER' || raw.endsWith('.OWNER')) return 'OWNER'
  if (raw === 'CASHIER' || raw.endsWith('.CASHIER')) return 'CASHIER'
  return 'CASHIER'
}

export async function fetchMe(): Promise<MeResponse> {
  const r = await fetch(`${API}/api/auth/me/`, { credentials: 'include' })
  if (!r.ok) throw new Error('UNAUTHENTICATED')
  const j = (await r.json()) as { username?: unknown; role?: unknown }
  return {
    username: typeof j.username === 'string' ? j.username : '',
    role: normalizeRole(j.role),
  }
}

export type Category = { id: string; name_uz: string; name_ru: string }
export type Product = {
  id: string
  category: string
  name_uz: string
  name_ru: string
  is_active: boolean
  deleted_at: string | null
}
export type Variant = {
  id: string
  product: string
  product_name_uz: string
  size: string
  size_label_uz: string
  color: string
  color_label_uz: string
  barcode: string
  purchase_price: string
  list_price: string
  stock_qty: number
  is_active: boolean
  deleted_at: string | null
}
export type Size = { id: string; label_uz: string }
export type Color = { id: string; label_uz: string }
export type Paginated<T> = {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

function toPaginated<T>(input: unknown): Paginated<T> {
  if (
    typeof input === 'object' &&
    input !== null &&
    'results' in input &&
    Array.isArray((input as { results: unknown[] }).results)
  ) {
    return input as Paginated<T>
  }
  const rows = Array.isArray(input) ? (input as T[]) : []
  return { count: rows.length, next: null, previous: null, results: rows }
}

export async function fetchCategories(): Promise<Category[]> {
  const r = await fetch(`${API}/api/catalog/categories/`, { credentials: 'include' })
  if (!r.ok) throw new Error('FETCH_CATEGORIES_FAILED')
  return r.json()
}

export async function fetchProducts(params?: {
  includeDeleted?: boolean
  q?: string
  page?: number
  pageSize?: number
}): Promise<Paginated<Product>> {
  const q = new URLSearchParams()
  if (params?.includeDeleted) q.set('include_deleted', '1')
  if (params?.q) q.set('q', params.q)
  if (params?.page) q.set('page', String(params.page))
  if (params?.pageSize) q.set('page_size', String(params.pageSize))
  const qs = q.toString() ? `?${q.toString()}` : ''
  const r = await fetch(`${API}/api/catalog/products/${qs}`, { credentials: 'include' })
  if (!r.ok) throw new Error('FETCH_PRODUCTS_FAILED')
  return toPaginated<Product>(await r.json())
}

export async function fetchVariants(params?: {
  includeDeleted?: boolean
  q?: string
  page?: number
  pageSize?: number
}): Promise<Paginated<Variant>> {
  const q = new URLSearchParams()
  if (params?.includeDeleted) q.set('include_deleted', '1')
  if (params?.q) q.set('q', params.q)
  if (params?.page) q.set('page', String(params.page))
  if (params?.pageSize) q.set('page_size', String(params.pageSize))
  const qs = q.toString() ? `?${q.toString()}` : ''
  const r = await fetch(`${API}/api/catalog/variants/${qs}`, { credentials: 'include' })
  if (!r.ok) throw new Error('FETCH_VARIANTS_FAILED')
  return toPaginated<Variant>(await r.json())
}

export async function fetchSizes(): Promise<Size[]> {
  const r = await fetch(`${API}/api/catalog/sizes/`, { credentials: 'include' })
  if (!r.ok) throw new Error('FETCH_SIZES_FAILED')
  return r.json()
}

export async function fetchColors(): Promise<Color[]> {
  const r = await fetch(`${API}/api/catalog/colors/`, { credentials: 'include' })
  if (!r.ok) throw new Error('FETCH_COLORS_FAILED')
  return r.json()
}

export async function createVariant(body: {
  product: string
  size: string
  color: string
  purchase_price: string
  list_price: string
  stock_qty: number
  is_active?: boolean
}) {
  const csrf = (await fetchCsrf()) || getCookie('csrftoken') || ''
  const r = await fetch(`${API}/api/catalog/variants/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.detail || 'CREATE_VARIANT_FAILED')
  return j as Variant
}

export async function updateVariant(
  id: string,
  patch: Partial<{
    purchase_price: string
    list_price: string
    is_active: boolean
    barcode: string
  }>,
) {
  const csrf = (await fetchCsrf()) || getCookie('csrftoken') || ''
  const r = await fetch(`${API}/api/catalog/variants/${id}/`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
    body: JSON.stringify(patch),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.detail || 'UPDATE_VARIANT_FAILED')
  return j as Variant
}

export type DebtRow = {
  id: string
  customer: string
  customer_name: string
  customer_phone: string
  remaining_amount: string
  total_amount: string
  paid_amount: string
  created_at: string
}

export async function fetchOpenDebts(): Promise<DebtRow[]> {
  const r = await fetch(`${API}/api/debt/debts/open/`, { credentials: 'include' })
  if (!r.ok) throw new Error('FETCH_DEBTS_FAILED')
  return r.json()
}

export async function repayDebt(customerId: string, amount: string): Promise<DebtRow[]> {
  const csrf = (await fetchCsrf()) || getCookie('csrftoken') || ''
  const r = await fetch(`${API}/api/debt/payments/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
    body: JSON.stringify({ customer_id: customerId, amount }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new AppError(j.code || 'DEBT_PAYMENT_FAILED', j.detail)
  return j as DebtRow[]
}

export type SaleHistoryRow = {
  id: string
  status: string
  cashier_username: string
  completed_at: string
  grand_total: string
  subtotal?: string
  discount_total?: string
}

export async function fetchSalesHistory(params?: {
  from?: string
  to?: string
  q?: string
  page?: number
}): Promise<Paginated<SaleHistoryRow>> {
  const q = new URLSearchParams()
  if (params?.from) q.set('from', params.from)
  if (params?.to) q.set('to', params.to)
  if (params?.q) q.set('q', params.q)
  if (params?.page) q.set('page', String(params.page))
  const qs = q.toString() ? `?${q.toString()}` : ''
  const r = await fetch(`${API}/api/sales/${qs}`, { credentials: 'include' })
  if (!r.ok) throw await parseErrorResponse(r, 'FETCH_SALES_FAILED')
  return r.json()
}

export async function exportSalesCsv(params?: { from?: string; to?: string }) {
  const q = new URLSearchParams()
  if (params?.from) q.set('from', params.from)
  if (params?.to) q.set('to', params.to)
  const qs = q.toString() ? `?${q.toString()}` : ''
  const r = await fetch(`${API}/api/sales/export/csv/${qs}`, { credentials: 'include' })
  if (!r.ok) throw new Error('EXPORT_SALES_FAILED')
  const blob = await r.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'sales_history.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export async function voidSale(saleId: string, reason: string) {
  const csrf = (await fetchCsrf()) || getCookie('csrftoken') || ''
  const r = await fetch(`${API}/api/sales/${saleId}/void/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
    body: JSON.stringify({ reason }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new AppError(j.code || 'VOID_FAILED', j.detail)
  return j
}

export type StoreSettings = {
  brand_name: string
  phone: string
  address: string
  footer_note: string
  transliterate_uz: boolean
  logo_url?: string | null
}

export async function fetchStoreSettings(): Promise<StoreSettings> {
  const r = await fetch(`${API}/api/printing/settings/`, { credentials: 'include' })
  if (!r.ok) throw new Error('FETCH_SETTINGS_FAILED')
  return r.json()
}

export async function updateStoreSettings(data: {
  brand_name: string
  phone: string
  address: string
  footer_note: string
  transliterate_uz: boolean
  logo?: File | null
}) {
  const csrf = (await fetchCsrf()) || getCookie('csrftoken') || ''
  const fd = new FormData()
  fd.append('brand_name', data.brand_name)
  fd.append('phone', data.phone)
  fd.append('address', data.address)
  fd.append('footer_note', data.footer_note)
  fd.append('transliterate_uz', data.transliterate_uz ? 'true' : 'false')
  if (data.logo) fd.append('logo', data.logo)
  const r = await fetch(`${API}/api/printing/settings/`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'X-CSRFToken': csrf },
    body: fd,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.detail || 'UPDATE_SETTINGS_FAILED')
  return j as StoreSettings
}

export type StocktakeSession = {
  id: string
  status: 'OPEN' | 'APPLIED'
  note: string
  lines: Array<{
    id: string
    variant: string
    product_name_uz: string
    barcode: string
    expected_qty: number
    counted_qty: number | null
    variance_qty: number
  }>
}

export async function createStocktakeSession(note = ''): Promise<StocktakeSession> {
  const csrf = (await fetchCsrf()) || getCookie('csrftoken') || ''
  const r = await fetch(`${API}/api/inventory/stocktake/sessions/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
    body: JSON.stringify({ note }),
  })
  if (!r.ok) throw new Error('CREATE_STOCKTAKE_FAILED')
  return r.json()
}

export async function fetchStocktakeSession(id: string): Promise<StocktakeSession> {
  const r = await fetch(`${API}/api/inventory/stocktake/sessions/${id}/`, {
    credentials: 'include',
  })
  if (!r.ok) throw new Error('FETCH_STOCKTAKE_FAILED')
  return r.json()
}

export async function setStocktakeCount(
  sessionId: string,
  variantId: string,
  countedQty: number,
) {
  const csrf = (await fetchCsrf()) || getCookie('csrftoken') || ''
  const r = await fetch(`${API}/api/inventory/stocktake/sessions/${sessionId}/count/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
    body: JSON.stringify({ variant_id: variantId, counted_qty: countedQty }),
  })
  if (!r.ok) throw new Error('SET_STOCKTAKE_COUNT_FAILED')
  return r.json()
}

export async function applyStocktake(sessionId: string) {
  const csrf = (await fetchCsrf()) || getCookie('csrftoken') || ''
  const r = await fetch(`${API}/api/inventory/stocktake/sessions/${sessionId}/apply/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRFToken': csrf },
  })
  if (!r.ok) throw new Error('APPLY_STOCKTAKE_FAILED')
  return r.json()
}

export async function listStocktakeSessions(status?: 'OPEN' | 'APPLIED') {
  const q = status ? `?status=${status}` : ''
  const r = await fetch(`${API}/api/inventory/stocktake/sessions/list/${q}`, {
    credentials: 'include',
  })
  if (!r.ok) throw new Error('LIST_STOCKTAKE_FAILED')
  return r.json() as Promise<
    Array<{ id: string; status: 'OPEN' | 'APPLIED'; note: string; created_at: string }>
  >
}

export async function backupNow() {
  const csrf = (await fetchCsrf()) || getCookie('csrftoken') || ''
  const r = await fetch(`${API}/api/backup-now/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRFToken': csrf },
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new AppError(j.code || 'BACKUP_FAILED', j.detail)
  return j as { ok: boolean; backup_path: string }
}
