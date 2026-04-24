import { useEffect, useState } from 'react'
import { printEscposBase64 } from './utils/tauriPrint'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  adjustInventory,
  applyStocktake,
  createCategory,
  createColor,
  createProduct,
  createSize,
  createStocktakeSession,
  createVariantBulkGrid,
  exportSalesCsv,
  fetchCategories,
  fetchColors,
  fetchMe,
  fetchOpenDebts,
  fetchProducts,
  fetchDashboardSummary,
  fetchIntegrationSettings,
  fetchLabelEscpos,
  fetchLabelQueueEscpos,
  fetchSalesHistory,
  fetchSizes,
  fetchStocktakeSession,
  listStocktakeSessions,
  fetchStoreSettings,
  fetchVariants,
  logout,
  repayDebt,
  sendTelegramZReport,
  sendWhatsAppReminder,
  backupNow,
  receiveInventory,
  setStocktakeCount,
  updateIntegrationSettings,
  updateStoreSettings,
  updateVariant,
  voidSale,
  type Category,
  type Color,
  type DashboardSummary,
  type DebtRow,
  type IntegrationSettings,
  type Paginated,
  type Product,
  type SaleHistoryRow,
  type Size,
  type StocktakeSession,
  type StoreSettings,
  type UserRole,
  type Variant,
  type BulkGridCell,
} from './api'
import { AdminSidebar } from './components/AdminSidebar'
import { ProtectedRoute } from './components/ProtectedRoute'
import { CatalogPage } from './pages/CatalogPage'
import { DashboardPage } from './pages/DashboardPage'
import { DebtsPage } from './pages/DebtsPage'
import { InventoryPage } from './pages/InventoryPage'
import { LoginPage } from './pages/LoginPage'
import { PosPage } from './pages/PosPage'
import { SalesHistoryPage } from './pages/SalesHistoryPage'
import { SettingsPage } from './pages/SettingsPage'

export default function App() {
  const { t } = useTranslation()
  const [booting, setBooting] = useState(true)
  const [authed, setAuthed] = useState(false)
  const [role, setRole] = useState<UserRole | null>(null)
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [salesFilter, setSalesFilter] = useState<{ from?: string; to?: string; q?: string; page: number }>({
    page: 1,
  })
  const [catalogFilter, setCatalogFilter] = useState<{ q?: string; page: number }>({ page: 1 })

  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [sizes, setSizes] = useState<Size[]>([])
  const [colors, setColors] = useState<Color[]>([])
  const [variants, setVariants] = useState<Paginated<Variant>>({
    count: 0,
    next: null,
    previous: null,
    results: [],
  })
  const [debts, setDebts] = useState<DebtRow[]>([])
  const [sales, setSales] = useState<Paginated<SaleHistoryRow>>({
    count: 0,
    next: null,
    previous: null,
    results: [],
  })
  const [settings, setSettings] = useState<StoreSettings | null>(null)
  const [stocktake, setStocktake] = useState<StocktakeSession | null>(null)
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null)
  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSettings | null>(null)
  const isManager = role === 'ADMIN' || role === 'OWNER'

  async function refreshAdminData() {
    if (!isManager) return
    const results = await Promise.allSettled([
      fetchCategories(),
      fetchProducts({ includeDeleted, page: 1, pageSize: 200 }),
      fetchSizes(),
      fetchColors(),
      fetchVariants({
        includeDeleted,
        q: catalogFilter.q,
        page: catalogFilter.page,
      }),
      fetchOpenDebts(),
      fetchSalesHistory(salesFilter),
      fetchStoreSettings(),
      fetchDashboardSummary(),
      fetchIntegrationSettings(),
    ])
    if (results[0].status === 'fulfilled') setCategories(results[0].value)
    if (results[1].status === 'fulfilled') setProducts(results[1].value.results)
    if (results[2].status === 'fulfilled') setSizes(results[2].value)
    if (results[3].status === 'fulfilled') setColors(results[3].value)
    if (results[4].status === 'fulfilled') setVariants(results[4].value)
    if (results[5].status === 'fulfilled') setDebts(results[5].value)
    if (results[6].status === 'fulfilled') setSales(results[6].value)
    if (results[7].status === 'fulfilled') setSettings(results[7].value)
    if (results[8].status === 'fulfilled') setDashboardSummary(results[8].value)
    if (results[9].status === 'fulfilled') setIntegrationSettings(results[9].value)
  }

  useEffect(() => {
    ;(async () => {
      try {
        const me = await fetchMe()
        setRole(me.role)
        setAuthed(true)
      } catch {
        setAuthed(false)
        setRole(null)
      } finally {
        setBooting(false)
      }
    })()
  }, [])

  useEffect(() => {
    void refreshAdminData()
  }, [
    authed,
    role,
    includeDeleted,
    salesFilter.page,
    salesFilter.from,
    salesFilter.to,
    salesFilter.q,
    catalogFilter.page,
    catalogFilter.q,
  ])

  if (booting) return <div className="min-h-screen bg-slate-950 text-slate-100 p-6">{t('admin.common.loading')}</div>
  if (authed && !role) return <div className="min-h-screen bg-slate-950 text-slate-100 p-6">{t('admin.common.loading')}</div>

  if (!authed) {
    return (
      <LoginPage
        onDone={async () => {
          const me = await fetchMe()
          setRole(me.role)
          setAuthed(true)
        }}
      />
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/pos"
          element={
            <PosPage
              footerLangStrip
              onLogout={() => {
                setAuthed(false)
                setRole(null)
              }}
            />
          }
        />
        <Route
          path="/admin/*"
          element={
            <ProtectedRoute role={role} allow={['CASHIER', 'ADMIN', 'OWNER']}>
              <AdminPanel
                role={role}
                onLogout={() => {
                  setAuthed(false)
                  setRole(null)
                }}
                debts={debts}
                sales={sales}
                categories={categories}
                products={products}
                sizes={sizes}
                colors={colors}
                variants={variants.results}
                variantCount={variants.count}
                includeDeleted={includeDeleted}
                setIncludeDeleted={setIncludeDeleted}
                catalogPage={catalogFilter.page}
                settings={settings}
                dashboardSummary={dashboardSummary}
                integrationSettings={integrationSettings}
                stocktake={stocktake}
                onCreateVariantBulk={async (payload) => {
                  await createVariantBulkGrid(payload)
                  await refreshAdminData()
                }}
                onCreateCategory={async (payload) => {
                  await createCategory(payload)
                  await refreshAdminData()
                }}
                onCreateProduct={async (payload) => {
                  await createProduct(payload)
                  await refreshAdminData()
                }}
                onCreateSize={async (payload) => {
                  await createSize(payload)
                  await refreshAdminData()
                }}
                onCreateColor={async (payload) => {
                  await createColor(payload)
                  await refreshAdminData()
                }}
                onAdjustStockQuick={async (variantId, qtyDelta, note) => {
                  await adjustInventory(variantId, qtyDelta, note)
                  await refreshAdminData()
                }}
                onPrintSticker={async (variantId, copies, size) => {
                  const { escpos_base64 } = await fetchLabelEscpos(variantId, size, copies)
                  const labelPrinter = (settings?.label_printer_name || '').trim()
                  await printEscposBase64(escpos_base64, labelPrinter || null)
                }}
                onPrintStickerQueue={async (items, size) => {
                  const out = await fetchLabelQueueEscpos(items, size)
                  const labelPrinter = (settings?.label_printer_name || '').trim()
                  for (const row of out.items) {
                    await printEscposBase64(row.escpos_base64, labelPrinter || null)
                  }
                }}
                onToggleVariant={async (v) => {
                  await updateVariant(v.id, { is_active: !v.is_active })
                  await refreshAdminData()
                }}
                onUpdateVariant={async (v, patch) => {
                  await updateVariant(v.id, patch)
                  await refreshAdminData()
                }}
                onRepay={async (customerId, amount) => {
                  await repayDebt(customerId, amount)
                  await refreshAdminData()
                }}
                onSendDebtReminder={async (customerId, amount) => {
                  await sendWhatsAppReminder(customerId, amount)
                }}
                onSaveSettings={async (data) => {
                  await updateStoreSettings(data)
                  await refreshAdminData()
                }}
                onFilterSales={(from, to, q) => setSalesFilter({ from, to, q, page: 1 })}
                onSalesPage={(page) => setSalesFilter((p) => ({ ...p, page }))}
                onCatalogFilter={(q) => setCatalogFilter({ q, page: 1 })}
                onCatalogPage={(page) => setCatalogFilter((p) => ({ ...p, page }))}
                salesPage={salesFilter.page}
                onExportSales={() => exportSalesCsv({ from: salesFilter.from, to: salesFilter.to })}
                onVoidSale={async (saleId, reason) => {
                  await voidSale(saleId, reason)
                  await refreshAdminData()
                }}
                onCreateStocktake={async (note) => {
                  const s = await createStocktakeSession(note)
                  setStocktake(s)
                }}
                onReloadOpenStocktake={async () => {
                  const items = await listStocktakeSessions('OPEN')
                  if (items[0]) setStocktake(await fetchStocktakeSession(items[0].id))
                }}
                onSetStocktakeCount={async (variantId, countedQty) => {
                  if (!stocktake) return
                  await setStocktakeCount(stocktake.id, variantId, countedQty)
                  setStocktake(await fetchStocktakeSession(stocktake.id))
                }}
                onApplyStocktake={async () => {
                  if (!stocktake) return
                  await applyStocktake(stocktake.id)
                  setStocktake(await fetchStocktakeSession(stocktake.id))
                  await refreshAdminData()
                }}
                onBackupNow={backupNow}
                onInventoryReceive={async (variantId, qty, note) => {
                  await receiveInventory(variantId, qty, note)
                  await refreshAdminData()
                }}
                onInventoryAdjust={async (variantId, qtyDelta, note) => {
                  await adjustInventory(variantId, qtyDelta, note)
                  await refreshAdminData()
                }}
                onSaveIntegrations={async (data) => {
                  const next = await updateIntegrationSettings(data)
                  setIntegrationSettings(next)
                }}
                onSendZReport={sendTelegramZReport}
              />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to={isManager ? '/admin/dashboard' : '/pos'} replace />} />
        <Route path="*" element={<Navigate to={isManager ? '/admin/dashboard' : '/pos'} replace />} />
      </Routes>
    </BrowserRouter>
  )
}

function AdminPanel(props: {
  role: UserRole | null
  onLogout: () => void
  debts: DebtRow[]
  sales: Paginated<SaleHistoryRow>
  categories: Category[]
  products: Product[]
  sizes: Size[]
  colors: Color[]
  variants: Variant[]
  variantCount: number
  includeDeleted: boolean
  setIncludeDeleted: (v: boolean) => void
  catalogPage: number
  settings: StoreSettings | null
  dashboardSummary: DashboardSummary | null
  integrationSettings: IntegrationSettings | null
  stocktake: StocktakeSession | null
  onCreateVariantBulk: (payload: { product_id: string; matrix: BulkGridCell[] }) => Promise<void>
  onCreateCategory: (payload: { name_uz: string; name_ru: string }) => Promise<void>
  onCreateProduct: (payload: { category: string; name_uz: string; name_ru: string }) => Promise<void>
  onCreateSize: (payload: { value: string; label_uz: string; label_ru: string; sort_order?: number }) => Promise<void>
  onCreateColor: (payload: { value: string; label_uz: string; label_ru: string; sort_order?: number }) => Promise<void>
  onToggleVariant: (v: Variant) => Promise<void>
  onUpdateVariant: (
    v: Variant,
    patch: { purchase_price: string; list_price: string },
  ) => Promise<void>
  onRepay: (customerId: string, amount: string) => Promise<void>
  onSendDebtReminder: (customerId: string, amount: string) => Promise<void>
  onSaveSettings: (data: {
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
  }) => Promise<void>
  onFilterSales: (from: string, to: string, q: string) => void
  onSalesPage: (page: number) => void
  onCatalogFilter: (q: string) => void
  onCatalogPage: (page: number) => void
  onExportSales: () => void
  salesPage: number
  onVoidSale: (saleId: string, reason: string) => Promise<void>
  onCreateStocktake: (note: string) => Promise<void>
  onReloadOpenStocktake: () => Promise<void>
  onSetStocktakeCount: (variantId: string, countedQty: number) => Promise<void>
  onApplyStocktake: () => Promise<void>
  onBackupNow: () => Promise<{ ok: boolean; backup_path: string }>
  onInventoryReceive: (variantId: string, qty: number, note: string) => Promise<void>
  onInventoryAdjust: (variantId: string, qtyDelta: number, note: string) => Promise<void>
  onSaveIntegrations: (data: IntegrationSettings) => Promise<void>
  onSendZReport: () => Promise<{ ok: boolean; details?: string }>
  onAdjustStockQuick: (variantId: string, qtyDelta: number, note: string) => Promise<void>
  onPrintSticker: (variantId: string, copies: number, size: '40x30' | '58mm') => Promise<void>
  onPrintStickerQueue: (
    items: Array<{ variant_id: string; copies: number }>,
    size: '40x30' | '58mm',
  ) => Promise<void>
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const path = location.pathname.replace('/admin/', '').split('/')[0] || 'dashboard'
  const active = (['dashboard', 'pos', 'catalog', 'inventory', 'debts', 'sales', 'settings'] as const).includes(
    path as never,
  )
    ? (path as 'dashboard' | 'pos' | 'catalog' | 'inventory' | 'debts' | 'sales' | 'settings')
    : 'dashboard'
  const isCashier = props.role === 'CASHIER'

  async function handleAdminLogout() {
    try {
      await logout()
    } catch {
      /* ignore */
    }
    props.onLogout()
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      <AdminSidebar
        active={active}
        role={props.role ?? 'CASHIER'}
        onSelect={(s) => navigate(`/admin/${s}`)}
        onLogout={handleAdminLogout}
      />
      <main className="flex-1">
        <Routes>
          <Route path="dashboard" element={isCashier ? <Navigate to="/admin/sales" replace /> : <DashboardPage summary={props.dashboardSummary} onSendZReport={props.onSendZReport} />} />
          <Route path="pos" element={<PosPage onLogout={props.onLogout} />} />
          <Route
            path="catalog"
            element={
              isCashier ? <Navigate to="/admin/sales" replace /> : <CatalogPage
                categories={props.categories}
                products={props.products}
                sizes={props.sizes}
                colors={props.colors}
                variants={props.variants}
                count={props.variantCount}
                includeDeleted={props.includeDeleted}
                setIncludeDeleted={props.setIncludeDeleted}
                page={props.catalogPage}
                onCreateVariantBulk={props.onCreateVariantBulk}
                onCreateCategory={props.onCreateCategory}
                onCreateProduct={props.onCreateProduct}
                onCreateSize={props.onCreateSize}
                onCreateColor={props.onCreateColor}
                onAdjustStockQuick={props.onAdjustStockQuick}
                onPrintSticker={props.onPrintSticker}
                onPrintStickerQueue={props.onPrintStickerQueue}
                onToggleVariant={props.onToggleVariant}
                onUpdateVariant={props.onUpdateVariant}
                onFilter={props.onCatalogFilter}
                onPage={props.onCatalogPage}
              />
            }
          />
          <Route path="inventory" element={isCashier ? <Navigate to="/admin/sales" replace /> : <InventoryPage
            variants={props.variants}
            stocktake={props.stocktake}
            onReceive={props.onInventoryReceive}
            onAdjust={props.onInventoryAdjust}
            onCreateStocktake={props.onCreateStocktake}
            onReloadOpen={props.onReloadOpenStocktake}
            onSetCount={props.onSetStocktakeCount}
            onApplyStocktake={props.onApplyStocktake}
          />} />
          <Route path="debts" element={isCashier ? <Navigate to="/admin/sales" replace /> : <DebtsPage debts={props.debts} onRepay={props.onRepay} onSendReminder={props.onSendDebtReminder} />} />
          <Route
            path="sales"
            element={
              <SalesHistoryPage
                sales={props.sales.results}
                count={props.sales.count}
                page={props.salesPage}
                onPage={props.onSalesPage}
                onFilter={props.onFilterSales}
                onExport={props.onExportSales}
                onVoid={props.onVoidSale}
                canVoid={!isCashier}
                canExport={!isCashier}
              />
            }
          />
          <Route
            path="settings"
            element={
              isCashier ? <Navigate to="/admin/sales" replace /> : <SettingsPage
                settings={props.settings}
                integrations={props.integrationSettings}
                onSave={props.onSaveSettings}
                onSaveIntegrations={props.onSaveIntegrations}
                onSendZReport={props.onSendZReport}
                stocktake={props.stocktake}
                onCreateStocktake={props.onCreateStocktake}
                onReloadOpen={props.onReloadOpenStocktake}
                onSetCount={props.onSetStocktakeCount}
                onApplyStocktake={props.onApplyStocktake}
                onBackupNow={props.onBackupNow}
                canManageInventory={!isCashier}
              />
            }
          />
          <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  )
}
