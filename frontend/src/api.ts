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

/** Catalog variant row returned to POS (no purchase_price). */
export type PosVariant = {
  id: string
  product: string
  product_name_uz: string
  size: string
  size_label_uz: string
  color: string
  color_label_uz: string
  barcode: string
  list_price: string
  stock_qty: number
  is_active: boolean
  deleted_at: string | null
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

export async function fetchVariantByBarcode(code: string): Promise<PosVariant> {
  const r = await fetch(
    `${API}/api/catalog/variants/by-barcode/?code=${encodeURIComponent(code)}`,
    { credentials: 'include' },
  )
  if (r.status === 404) {
    throw await parseErrorResponse(r, 'BARCODE_NOT_FOUND')
  }
  if (!r.ok) throw await parseErrorResponse(r, 'API_ERROR')
  return r.json() as Promise<PosVariant>
}

export async function fetchPosVariantSearch(q: string): Promise<PosVariant[]> {
  const trimmed = q.trim()
  if (trimmed.length < 2) return []
  const r = await fetch(
    `${API}/api/catalog/variants/pos-search/?q=${encodeURIComponent(trimmed)}&limit=30`,
    { credentials: 'include' },
  )
  if (!r.ok) throw await parseErrorResponse(r, 'API_ERROR')
  const j = (await r.json()) as { results?: PosVariant[] }
  return Array.isArray(j.results) ? j.results : []
}

export async function fetchPosVariantsByProduct(productId: string, colorId?: string): Promise<PosVariant[]> {
  const qs = new URLSearchParams({ product_id: productId })
  if (colorId) qs.set('color_id', colorId)
  const r = await fetch(`${API}/api/catalog/variants/pos-by-product/?${qs}`, { credentials: 'include' })
  if (!r.ok) throw await parseErrorResponse(r, 'API_ERROR')
  const j = (await r.json()) as { results?: PosVariant[] }
  return Array.isArray(j.results) ? j.results : []
}

export async function updatePosVariantPrice(variantId: string, listPrice: string) {
  const csrf = (await fetchCsrf()) || getCookie('csrftoken') || ''
  const r = await fetch(`${API}/api/catalog/variants/${variantId}/pos-price/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
    body: JSON.stringify({ list_price: listPrice }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new AppError(j.code || 'POS_PRICE_UPDATE_FAILED', j.detail)
  return j as PosVariant
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

export type Size = { id: string; value: string; label_uz: string; label_ru?: string }
export type Color = { id: string; value: string; label_uz: string; label_ru?: string }
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

export async function createCategory(body: { name_uz: string; name_ru: string; sort_order?: number }) {
  const csrf = (await fetchCsrf()) || getCookie('csrftoken') || ''
  const r = await fetch(`${API}/api/catalog/categories/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new AppError(j.code || 'CREATE_CATEGORY_FAILED', j.detail)
  return j as Category
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

export async function createProduct(body: {
  category: string
  name_uz: string
  name_ru: string
  is_active?: boolean
}) {
  const csrf = (await fetchCsrf()) || getCookie('csrftoken') || ''
  const r = await fetch(`${API}/api/catalog/products/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new AppError(j.code || 'CREATE_PRODUCT_FAILED', j.detail)
  return j as Product
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

export async function createSize(body: {
  value: string
  label_uz: string
  label_ru: string
  sort_order?: number
}) {
  const csrf = (await fetchCsrf()) || getCookie('csrftoken') || ''
  const r = await fetch(`${API}/api/catalog/sizes/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new AppError(j.code || 'CREATE_SIZE_FAILED', j.detail)
  return j as Size
}

export async function fetchColors(): Promise<Color[]> {
  const r = await fetch(`${API}/api/catalog/colors/`, { credentials: 'include' })
  if (!r.ok) throw new Error('FETCH_COLORS_FAILED')
  return r.json()
}

export async function createColor(body: {
  value: string
  label_uz: string
  label_ru: string
  sort_order?: number
}) {
  const csrf = (await fetchCsrf()) || getCookie('csrftoken') || ''
  const r = await fetch(`${API}/api/catalog/colors/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new AppError(j.code || 'CREATE_COLOR_FAILED', j.detail)
  return j as Color
}

export type BulkGridCell = {
  size_id: string
  color_id: string
  purchase_price: string
  list_price: string
  initial_qty?: number
}

export async function createVariantBulkGrid(body: { product_id: string; matrix: BulkGridCell[] }) {
  const csrf = (await fetchCsrf()) || getCookie('csrftoken') || ''
  const r = await fetch(`${API}/api/catalog/variants/bulk-grid/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new AppError(j.code || 'BULK_GRID_FAILED', j.detail)
  return j as Variant[]
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

export type DashboardSummary = {
  totals: {
    sales_count: number
    sales_amount: string
    today_sales_amount: string
    void_count: number
    avg_check: string
    gross_profit: string
    total_discounts: string
    open_debt_count: number
    open_debt_total: string
  }
  top_cashiers: Array<{
    cashier: string
    sales_count: number
    sales_amount: string
  }>
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

export async function fetchDashboardSummary(params?: { from?: string; to?: string }) {
  const q = new URLSearchParams()
  if (params?.from) q.set('from', params.from)
  if (params?.to) q.set('to', params.to)
  const qs = q.toString() ? `?${q.toString()}` : ''
  const r = await fetch(`${API}/api/reports/summary/${qs}`, { credentials: 'include' })
  if (!r.ok) throw await parseErrorResponse(r, 'FETCH_DASHBOARD_FAILED')
  return (await r.json()) as DashboardSummary
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
  receipt_printer_name: string
  label_printer_name: string
  receipt_width: '58mm' | '80mm'
  auto_print_on_sale: boolean
  scanner_mode: 'keyboard' | 'serial'
  scanner_prefix: string
  scanner_suffix: string
  logo_url?: string | null
}

export type HardwareConfig = Pick<
  StoreSettings,
  | 'receipt_printer_name'
  | 'label_printer_name'
  | 'receipt_width'
  | 'auto_print_on_sale'
  | 'scanner_mode'
  | 'scanner_prefix'
  | 'scanner_suffix'
>

export type IntegrationSettings = {
  telegram_bot_token: string
  telegram_chat_id: string
  whatsapp_api_base: string
  whatsapp_api_token: string
  whatsapp_sender: string
  updated_at?: string
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
  receipt_printer_name: string
  label_printer_name: string
  receipt_width: '58mm' | '80mm'
  auto_print_on_sale: boolean
  scanner_mode: 'keyboard' | 'serial'
  scanner_prefix: string
  scanner_suffix: string
  logo?: File | null
}) {
  const csrf = (await fetchCsrf()) || getCookie('csrftoken') || ''
  const fd = new FormData()
  fd.append('brand_name', data.brand_name)
  fd.append('phone', data.phone)
  fd.append('address', data.address)
  fd.append('footer_note', data.footer_note)
  fd.append('transliterate_uz', data.transliterate_uz ? 'true' : 'false')
  fd.append('receipt_printer_name', data.receipt_printer_name)
  fd.append('label_printer_name', data.label_printer_name)
  fd.append('receipt_width', data.receipt_width)
  fd.append('auto_print_on_sale', data.auto_print_on_sale ? 'true' : 'false')
  fd.append('scanner_mode', data.scanner_mode)
  fd.append('scanner_prefix', data.scanner_prefix)
  fd.append('scanner_suffix', data.scanner_suffix)
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

export async function fetchHardwareConfig(): Promise<HardwareConfig> {
  const r = await fetch(`${API}/api/printing/hardware-config/`, { credentials: 'include' })
  if (!r.ok) throw await parseErrorResponse(r, 'FETCH_HARDWARE_CONFIG_FAILED')
  return r.json()
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

export async function fetchIntegrationSettings(): Promise<IntegrationSettings> {
  const r = await fetch(`${API}/api/integrations/settings/`, { credentials: 'include' })
  if (!r.ok) throw await parseErrorResponse(r, 'FETCH_INTEGRATIONS_FAILED')
  return r.json()
}

export async function updateIntegrationSettings(data: IntegrationSettings) {
  const csrf = (await fetchCsrf()) || getCookie('csrftoken') || ''
  const r = await fetch(`${API}/api/integrations/settings/`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
    body: JSON.stringify(data),
  })
  if (!r.ok) throw await parseErrorResponse(r, 'UPDATE_INTEGRATIONS_FAILED')
  return (await r.json()) as IntegrationSettings
}

export async function sendTelegramZReport() {
  const csrf = (await fetchCsrf()) || getCookie('csrftoken') || ''
  const r = await fetch(`${API}/api/integrations/telegram/send-z-report/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRFToken': csrf },
  })
  if (!r.ok) throw await parseErrorResponse(r, 'TELEGRAM_SEND_FAILED')
  return r.json() as Promise<{ ok: boolean; details?: string }>
}

export async function sendWhatsAppReminder(customerId: string, amount: string) {
  const csrf = (await fetchCsrf()) || getCookie('csrftoken') || ''
  const r = await fetch(`${API}/api/integrations/whatsapp/remind/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
    body: JSON.stringify({ customer_id: customerId, amount }),
  })
  if (!r.ok) throw await parseErrorResponse(r, 'WHATSAPP_SEND_FAILED')
  return r.json() as Promise<{ ok: boolean; details?: string }>
}

export async function receiveInventory(variantId: string, qty: number, note: string) {
  const csrf = (await fetchCsrf()) || getCookie('csrftoken') || ''
  const r = await fetch(`${API}/api/inventory/receive/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
    body: JSON.stringify({ variant_id: variantId, qty, note }),
  })
  if (!r.ok) throw await parseErrorResponse(r, 'INVENTORY_RECEIVE_FAILED')
  return r.json() as Promise<{ variant_id: string; stock_qty: number }>
}

export async function adjustInventory(variantId: string, qtyDelta: number, note: string) {
  const csrf = (await fetchCsrf()) || getCookie('csrftoken') || ''
  const r = await fetch(`${API}/api/inventory/adjust/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
    body: JSON.stringify({ variant_id: variantId, qty_delta: qtyDelta, note }),
  })
  if (!r.ok) throw await parseErrorResponse(r, 'INVENTORY_ADJUST_FAILED')
  return r.json() as Promise<{ variant_id: string; stock_qty: number }>
}

export async function fetchLabelEscpos(variantId: string, size: '40x30' | '58mm' = '40x30', copies = 1) {
  const csrf = (await fetchCsrf()) || getCookie('csrftoken') || ''
  const r = await fetch(`${API}/api/printing/labels/escpos/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
    body: JSON.stringify({ variant_id: variantId, size, copies }),
  })
  if (!r.ok) throw await parseErrorResponse(r, 'LABEL_PRINT_FAILED')
  return (await r.json()) as { escpos_base64: string }
}

export async function fetchLabelQueueEscpos(
  items: Array<{ variant_id: string; copies: number }>,
  size: '40x30' | '58mm' = '40x30',
) {
  const csrf = (await fetchCsrf()) || getCookie('csrftoken') || ''
  const r = await fetch(`${API}/api/printing/labels/queue/escpos/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
    body: JSON.stringify({ size, items }),
  })
  if (!r.ok) throw await parseErrorResponse(r, 'LABEL_QUEUE_FAILED')
  return (await r.json()) as {
    size: '40x30' | '58mm'
    items: Array<{ variant_id: string; barcode: string; escpos_base64: string }>
  }
}
