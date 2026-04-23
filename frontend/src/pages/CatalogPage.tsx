import { useEffect, useMemo, useState } from 'react'
import type { Category, Color, Product, Size, Variant } from '../api'
import { useTranslation } from 'react-i18next'

type CreateVariantInput = {
  product: string
  size: string
  color: string
  purchase_price: string
  list_price: string
  stock_qty: number
}

export function CatalogPage({
  categories,
  products,
  sizes,
  colors,
  variants,
  count,
  includeDeleted,
  setIncludeDeleted,
  page,
  onCreateVariant,
  onToggleVariant,
  onUpdateVariant,
  onFilter,
  onPage,
}: {
  categories: Category[]
  products: Product[]
  sizes: Size[]
  colors: Color[]
  variants: Variant[]
  count: number
  includeDeleted: boolean
  setIncludeDeleted: (v: boolean) => void
  page: number
  onCreateVariant: (payload: CreateVariantInput) => Promise<void>
  onToggleVariant: (v: Variant) => Promise<void>
  onUpdateVariant: (
    v: Variant,
    patch: { purchase_price: string; list_price: string },
  ) => Promise<void>
  onFilter: (q: string) => void
  onPage: (page: number) => void
}) {
  const { t } = useTranslation()
  const [form, setForm] = useState<CreateVariantInput>({
    product: '',
    size: '',
    color: '',
    purchase_price: '0',
    list_price: '0',
    stock_qty: 0,
  })
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<Variant | null>(null)
  const [editPrice, setEditPrice] = useState('')
  const [editPurchase, setEditPurchase] = useState('')
  const [query, setQuery] = useState('')
  const categoryById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories])
  const maxPage = Math.max(1, Math.ceil(count / 20))

  useEffect(() => {
    const timer = setTimeout(() => onFilter(query.trim()), 300)
    return () => clearTimeout(timer)
  }, [query, onFilter])

  async function submitVariant(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await onCreateVariant(form)
      setForm((p) => ({ ...p, purchase_price: '0', list_price: '0', stock_qty: 0 }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t('admin.catalog.title')}</h2>
        <div className="flex items-center gap-2">
          <input
            className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('admin.catalog.searchPlaceholder')}
          />
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)}
            />
            {t('admin.catalog.showDeleted')}
          </label>
        </div>
      </div>
      <p className="text-xs text-slate-400">{t('admin.catalog.hint')}</p>

      <form className="rounded border border-slate-700 bg-slate-900 p-3 grid md:grid-cols-6 gap-2" onSubmit={submitVariant}>
        <select
          className="px-2 py-2 rounded bg-slate-950 border border-slate-700"
          value={form.product}
          onChange={(e) => setForm({ ...form, product: e.target.value })}
          required
        >
          <option value="">{t('admin.catalog.product')}</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name_uz} ({categoryById[p.category]?.name_uz ?? t('admin.common.na')})
            </option>
          ))}
        </select>
        <select
          className="px-2 py-2 rounded bg-slate-950 border border-slate-700"
          value={form.size}
          onChange={(e) => setForm({ ...form, size: e.target.value })}
          required
        >
          <option value="">{t('admin.catalog.size')}</option>
          {sizes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label_uz}
            </option>
          ))}
        </select>
        <select
          className="px-2 py-2 rounded bg-slate-950 border border-slate-700"
          value={form.color}
          onChange={(e) => setForm({ ...form, color: e.target.value })}
          required
        >
          <option value="">{t('admin.catalog.color')}</option>
          {colors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label_uz}
            </option>
          ))}
        </select>
        <input
          className="px-2 py-2 rounded bg-slate-950 border border-slate-700"
          placeholder={t('admin.catalog.purchase')}
          value={form.purchase_price}
          onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
          required
        />
        <input
          className="px-2 py-2 rounded bg-slate-950 border border-slate-700"
          placeholder={t('admin.catalog.sale')}
          value={form.list_price}
          onChange={(e) => setForm({ ...form, list_price: e.target.value })}
          required
        />
        <button
          type="submit"
          disabled={busy}
          className="px-3 py-2 rounded bg-emerald-700 border border-emerald-500 disabled:opacity-40"
        >
          {busy ? t('admin.common.saving') : t('admin.catalog.addVariant')}
        </button>
      </form>

      <div className="rounded border border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="text-left p-2">{t('admin.catalog.product')}</th>
              <th className="text-left p-2">{t('admin.catalog.sizeColor')}</th>
              <th className="text-left p-2">{t('admin.catalog.barcode')}</th>
              <th className="text-right p-2">{t('admin.catalog.stock')}</th>
              <th className="text-right p-2">{t('admin.catalog.price')}</th>
              <th className="text-right p-2">{t('admin.catalog.action')}</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v.id} className="border-t border-slate-800">
                <td className="p-2">{v.product_name_uz}</td>
                <td className="p-2">{v.size_label_uz} / {v.color_label_uz}</td>
                <td className="p-2">{v.barcode}</td>
                <td className="p-2 text-right">{v.stock_qty}</td>
                <td className="p-2 text-right">{v.list_price}</td>
                <td className="p-2 text-right">
                  <div className="inline-flex gap-2">
                    <button
                      type="button"
                      className="px-2 py-1 rounded bg-slate-800 border border-slate-600"
                      onClick={() => {
                        setEditing(v)
                        setEditPrice(v.list_price)
                        setEditPurchase(v.purchase_price)
                      }}
                    >
                      {t('admin.catalog.edit')}
                    </button>
                    <button
                      type="button"
                      className="px-2 py-1 rounded bg-slate-800 border border-slate-600"
                      onClick={() => void onToggleVariant(v)}
                    >
                      {v.is_active ? t('admin.catalog.deactivate') : t('admin.catalog.activate')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {variants.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-slate-500">
                  {t('admin.catalog.empty')}
                </td>
              </tr>
            )}
            {variants.length === 0 && query && (
              <tr>
                <td colSpan={6} className="p-2 text-center text-xs text-slate-400">
                  {t('admin.catalog.emptyFiltered')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="px-3 py-1 rounded bg-slate-800 border border-slate-700 disabled:opacity-50"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          {t('admin.common.prev')}
        </button>
        <div className="px-3 py-1 text-sm text-slate-400">
          {t('admin.common.pageOf', { page, maxPage })}
        </div>
        <button
          type="button"
          className="px-3 py-1 rounded bg-slate-800 border border-slate-700 disabled:opacity-50"
          disabled={page >= maxPage}
          onClick={() => onPage(page + 1)}
        >
          {t('admin.common.next')}
        </button>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded border border-slate-700 bg-slate-900 p-4 space-y-3">
            <h3 className="text-lg font-semibold">{t('admin.catalog.editVariant')}</h3>
            <div className="text-sm text-slate-400">{editing.product_name_uz} / {editing.barcode}</div>
            <input
              className="w-full px-2 py-2 rounded bg-slate-950 border border-slate-700"
              value={editPurchase}
              onChange={(e) => setEditPurchase(e.target.value)}
              placeholder={t('admin.catalog.purchasePrice')}
            />
            <input
              className="w-full px-2 py-2 rounded bg-slate-950 border border-slate-700"
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
              placeholder={t('admin.catalog.salePrice')}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded bg-slate-800 border border-slate-600"
                onClick={() => setEditing(null)}
              >
                {t('admin.common.cancel')}
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded bg-emerald-700 border border-emerald-500"
                onClick={async () => {
                  await onUpdateVariant(editing, {
                    list_price: editPrice,
                    purchase_price: editPurchase,
                  })
                  setEditing(null)
                }}
              >
                {t('admin.common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
