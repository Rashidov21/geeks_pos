import { useMemo, useState } from 'react'
import type { StocktakeSession, Variant } from '../api'
import { useTranslation } from 'react-i18next'
import { ActionToast } from '../components/ActionToast'

export function InventoryPage({
  variants,
  stocktake,
  onReceive,
  onAdjust,
  onCreateStocktake,
  onReloadOpen,
  onSetCount,
  onApplyStocktake,
}: {
  variants: Variant[]
  stocktake: StocktakeSession | null
  onReceive: (variantId: string, qty: number, note: string) => Promise<void>
  onAdjust: (variantId: string, qtyDelta: number, note: string) => Promise<void>
  onCreateStocktake: (note: string) => Promise<void>
  onReloadOpen: () => Promise<void>
  onSetCount: (variantId: string, countedQty: number) => Promise<void>
  onApplyStocktake: () => Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const [variantId, setVariantId] = useState('')
  const [qty, setQty] = useState('1')
  const [qtyDelta, setQtyDelta] = useState('0')
  const [note, setNote] = useState('')
  const [stocktakeNote, setStocktakeNote] = useState('')
  const [countByVariant, setCountByVariant] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err' | 'info'; message: string } | null>(null)

  const variantOptions = useMemo(
    () => variants.map((v) => ({ id: v.id, label: `${v.product_name_uz} / ${v.barcode} / ${v.stock_qty}` })),
    [variants],
  )
  const selectedVariant = useMemo(() => variants.find((v) => v.id === variantId) || null, [variants, variantId])
  const receiveQty = Number(qty || '0')
  const adjustQty = Number(qtyDelta || '0')
  const receiveAfter = selectedVariant ? selectedVariant.stock_qty + (Number.isFinite(receiveQty) ? receiveQty : 0) : null
  const adjustAfter = selectedVariant ? selectedVariant.stock_qty + (Number.isFinite(adjustQty) ? adjustQty : 0) : null

  async function runAction(fn: () => Promise<void>, okMessage: string) {
    setBusy(true)
    setToast(null)
    try {
      await fn()
      setToast({ kind: 'ok', message: okMessage })
    } catch (e: unknown) {
      const code = (e as Error & { code?: string }).code
      setToast({ kind: 'err', message: t(`err.${code || 'API_ERROR'}`) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-semibold">{t('admin.inventory.title')}</h2>
      <p className="text-sm text-slate-300">{t('admin.inventory.hint')}</p>
      <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-xs text-slate-300">
        {t('admin.inventory.flowHint')}
      </div>
      {toast && <ActionToast kind={toast.kind} message={toast.message} onClose={() => setToast(null)} />}

      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded border border-slate-700 bg-slate-900 p-3 space-y-2">
          <h3 className="font-medium">{t('admin.inventory.receiveTitle')}</h3>
          <p className="text-xs text-slate-400">{t('admin.inventory.receiveHint')}</p>
          <select
            className="touch-btn w-full min-h-12 px-3 rounded-xl bg-slate-950 border border-slate-700"
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
          >
            <option value="">{t('admin.inventory.variant')}</option>
            {variantOptions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
          <input
            className="touch-btn w-full min-h-12 px-3 rounded-xl bg-slate-950 border border-slate-700"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder={t('admin.inventory.qty')}
          />
          {selectedVariant && (
            <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">
              <div>
                {t('admin.inventory.currentStock')}: <span className="font-medium">{selectedVariant.stock_qty}</span>
              </div>
              <div>
                {t('admin.inventory.nextStock')}: <span className="font-medium">{receiveAfter}</span>
              </div>
            </div>
          )}
          <input
            className="touch-btn w-full min-h-12 px-3 rounded-xl bg-slate-950 border border-slate-700"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('admin.inventory.note')}
          />
          <button
            type="button"
            disabled={busy || !variantId}
            className="touch-btn w-full min-h-12 py-3 rounded-xl bg-emerald-700 border border-emerald-500 disabled:opacity-40 font-medium"
            onClick={() =>
              void runAction(
                () => onReceive(variantId, Number(qty || '0'), note),
                t('admin.inventory.receiveSuccess'),
              )
            }
          >
            {t('admin.inventory.receiveAction')}
          </button>
        </div>

        <div className="rounded border border-slate-700 bg-slate-900 p-3 space-y-2">
          <h3 className="font-medium">{t('admin.inventory.adjustTitle')}</h3>
          <p className="text-xs text-slate-400">{t('admin.inventory.adjustHint')}</p>
          <select
            className="touch-btn w-full min-h-12 px-3 rounded-xl bg-slate-950 border border-slate-700"
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
          >
            <option value="">{t('admin.inventory.variant')}</option>
            {variantOptions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
          <input
            className="touch-btn w-full min-h-12 px-3 rounded-xl bg-slate-950 border border-slate-700"
            value={qtyDelta}
            onChange={(e) => setQtyDelta(e.target.value)}
            placeholder={t('admin.inventory.qtyDelta')}
          />
          {selectedVariant && (
            <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">
              <div>
                {t('admin.inventory.currentStock')}: <span className="font-medium">{selectedVariant.stock_qty}</span>
              </div>
              <div>
                {t('admin.inventory.nextStock')}: <span className="font-medium">{adjustAfter}</span>
              </div>
            </div>
          )}
          <input
            className="touch-btn w-full min-h-12 px-3 rounded-xl bg-slate-950 border border-slate-700"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('admin.inventory.note')}
          />
          <button
            type="button"
            disabled={busy || !variantId}
            className="touch-btn w-full min-h-12 py-3 rounded-xl bg-amber-700 border border-amber-500 disabled:opacity-40 font-medium"
            onClick={() =>
              void runAction(
                () => onAdjust(variantId, Number(qtyDelta || '0'), note),
                t('admin.inventory.adjustSuccess'),
              )
            }
          >
            {t('admin.inventory.adjustAction')}
          </button>
        </div>
      </div>

      <div className="rounded border border-slate-700 bg-slate-900 p-3 space-y-3">
        <h3 className="font-medium">{t('admin.settings.stocktakeTitle')}</h3>
        <p className="text-xs text-slate-400">{t('admin.inventory.stocktakeHint')}</p>
        {!stocktake && (
          <div className="flex flex-wrap gap-2">
            <input
              className="touch-btn flex-1 min-h-12 px-3 rounded-xl bg-slate-950 border border-slate-700"
              value={stocktakeNote}
              onChange={(e) => setStocktakeNote(e.target.value)}
              placeholder={t('admin.settings.sessionNote')}
            />
            <button
              type="button"
              className="touch-btn min-h-12 px-4 rounded-xl bg-emerald-700 border border-emerald-500 font-medium"
              onClick={() => void runAction(() => onCreateStocktake(stocktakeNote), t('admin.settings.stocktakeStart'))}
            >
              {t('admin.settings.stocktakeStart')}
            </button>
            <button
              type="button"
              className="touch-btn min-h-12 px-4 rounded-xl bg-slate-800 border border-slate-700"
              onClick={() => void runAction(() => onReloadOpen(), t('admin.settings.stocktakeReload'))}
            >
              {t('admin.settings.reopenSession')}
            </button>
          </div>
        )}
        {stocktake && (
          <div className="space-y-2">
            <div className="text-sm text-slate-400">
              {t('admin.settings.session')}: {stocktake.id.slice(0, 8)} | {t(`status.${stocktake.status}`)}
            </div>
            <div className="max-h-72 overflow-auto kiosk-scrollbar rounded border border-slate-800">
              <table className="w-full text-sm">
                <thead className="bg-slate-900 text-slate-400">
                  <tr>
                    <th className="text-left p-2">{t('admin.catalog.product')}</th>
                    <th className="text-left p-2">{t('admin.catalog.barcode')}</th>
                    <th className="text-right p-2">{t('admin.settings.expected')}</th>
                    <th className="text-right p-2">{t('admin.settings.counted')}</th>
                    <th className="text-right p-2">{t('admin.settings.variance')}</th>
                    <th className="text-right p-2">{t('admin.common.save')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stocktake.lines.map((ln) => (
                    <tr key={ln.id} className="border-t border-slate-800">
                      <td className="p-2">
                        {i18n.language.startsWith('ru')
                          ? (ln as typeof ln & { product_name_ru?: string }).product_name_ru || ln.product_name_uz
                          : ln.product_name_uz}
                      </td>
                      <td className="p-2">{ln.barcode}</td>
                      <td className="p-2 text-right">{ln.expected_qty}</td>
                      <td className="p-2 text-right">{ln.counted_qty ?? '-'}</td>
                      <td className="p-2 text-right">{ln.variance_qty}</td>
                      <td className="p-2 text-right">
                        <div className="inline-flex gap-2">
                          <input
                            className="touch-btn min-h-12 px-3 rounded-lg bg-slate-950 border border-slate-700 w-32 text-base"
                            value={countByVariant[ln.variant] ?? ''}
                            onChange={(e) => setCountByVariant((p) => ({ ...p, [ln.variant]: e.target.value }))}
                            placeholder={t('admin.settings.qty')}
                          />
                          <button
                            type="button"
                            className="touch-btn min-h-12 px-3 rounded-lg bg-slate-800 border border-slate-600"
                            onClick={() => void runAction(() => onSetCount(ln.variant, Number(countByVariant[ln.variant] || '0')), t('admin.settings.stocktakeCount'))}
                          >
                            {t('admin.common.save')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {stocktake.status === 'OPEN' && (
              <button
                type="button"
                className="touch-btn min-h-12 px-5 rounded-xl bg-amber-700 border border-amber-500 font-medium"
                onClick={() => void runAction(() => onApplyStocktake(), t('admin.settings.stocktakeApply'))}
              >
                {t('admin.settings.applyVariance')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

