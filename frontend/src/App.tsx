import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  applyStocktake,
  createStocktakeSession,
  createVariant,
  exportSalesCsv,
  fetchCategories,
  fetchColors,
  fetchMe,
  fetchOpenDebts,
  fetchProducts,
  fetchSalesHistory,
  fetchSizes,
  fetchStocktakeSession,
  listStocktakeSessions,
  fetchStoreSettings,
  fetchVariants,
  repayDebt,
  backupNow,
  setStocktakeCount,
  updateStoreSettings,
  updateVariant,
  voidSale,
  type Category,
  type Color,
  type DebtRow,
  type Paginated,
  type Product,
  type SaleHistoryRow,
  type Size,
  type StocktakeSession,
  type StoreSettings,
  type UserRole,
  type Variant,
} from './api'
import { AdminSidebar } from './components/AdminSidebar'
import { ProtectedRoute } from './components/ProtectedRoute'
import { CatalogPage } from './pages/CatalogPage'
import { DashboardPage } from './pages/DashboardPage'
import { DebtsPage } from './pages/DebtsPage'
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
  const isManager = role === 'ADMIN' || role === 'OWNER'

  async function refreshAdminData() {
    if (!isManager) return
    try {
      const [c, p, s, col, v, d, sh, st] = await Promise.all([
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
      ])
      setCategories(c)
      setProducts(p.results)
      setSizes(s)
      setColors(col)
      setVariants(v)
      setDebts(d)
      setSales(sh)
      setSettings(st)
    } catch {}
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
            <ProtectedRoute role={role} allow={['ADMIN', 'OWNER']}>
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
                stocktake={stocktake}
                onCreateVariant={async (payload) => {
                  await createVariant(payload)
                  await refreshAdminData()
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
  stocktake: StocktakeSession | null
  onCreateVariant: (payload: {
    product: string
    size: string
    color: string
    purchase_price: string
    list_price: string
    stock_qty: number
  }) => Promise<void>
  onToggleVariant: (v: Variant) => Promise<void>
  onUpdateVariant: (
    v: Variant,
    patch: { purchase_price: string; list_price: string },
  ) => Promise<void>
  onRepay: (customerId: string, amount: string) => Promise<void>
  onSaveSettings: (data: {
    brand_name: string
    phone: string
    address: string
    footer_note: string
    transliterate_uz: boolean
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
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const path = location.pathname.replace('/admin/', '').split('/')[0] || 'dashboard'
  const active = (['dashboard', 'pos', 'catalog', 'debts', 'sales', 'settings'] as const).includes(
    path as never,
  )
    ? (path as 'dashboard' | 'pos' | 'catalog' | 'debts' | 'sales' | 'settings')
    : 'dashboard'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      <AdminSidebar
        active={active}
        role={props.role ?? 'CASHIER'}
        onSelect={(s) => navigate(`/admin/${s}`)}
      />
      <main className="flex-1">
        <Routes>
          <Route path="dashboard" element={<DashboardPage debts={props.debts} sales={props.sales.results} />} />
          <Route path="pos" element={<PosPage onLogout={props.onLogout} />} />
          <Route
            path="catalog"
            element={
              <CatalogPage
                categories={props.categories}
                products={props.products}
                sizes={props.sizes}
                colors={props.colors}
                variants={props.variants}
                count={props.variantCount}
                includeDeleted={props.includeDeleted}
                setIncludeDeleted={props.setIncludeDeleted}
                page={props.catalogPage}
                onCreateVariant={props.onCreateVariant}
                onToggleVariant={props.onToggleVariant}
                onUpdateVariant={props.onUpdateVariant}
                onFilter={props.onCatalogFilter}
                onPage={props.onCatalogPage}
              />
            }
          />
          <Route path="debts" element={<DebtsPage debts={props.debts} onRepay={props.onRepay} />} />
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
                canVoid={props.role === 'ADMIN' || props.role === 'OWNER'}
              />
            }
          />
          <Route
            path="settings"
            element={
              <SettingsPage
                settings={props.settings}
                onSave={props.onSaveSettings}
                stocktake={props.stocktake}
                onCreateStocktake={props.onCreateStocktake}
                onReloadOpen={props.onReloadOpenStocktake}
                onSetCount={props.onSetStocktakeCount}
                onApplyStocktake={props.onApplyStocktake}
                onBackupNow={props.onBackupNow}
                canManageInventory={props.role === 'ADMIN' || props.role === 'OWNER'}
              />
            }
          />
          <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  )
}
