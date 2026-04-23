import { useState } from 'react'
import type { StocktakeSession, StoreSettings } from '../api'
import { useTranslation } from 'react-i18next'

export function SettingsPage({
  settings,
  onSave,
  stocktake,
  onCreateStocktake,
  onSetCount,
  onApplyStocktake,
  onReloadOpen,
  onBackupNow,
  canManageInventory,
}: {
  settings: StoreSettings | null
  onSave: (data: {
    brand_name: string
    phone: string
    address: string
    footer_note: string
    transliterate_uz: boolean
    logo?: File | null
  }) => Promise<void>
  stocktake: StocktakeSession | null
  onCreateStocktake: (note: string) => Promise<void>
  onSetCount: (variantId: string, countedQty: number) => Promise<void>
  onApplyStocktake: () => Promise<void>
  onReloadOpen: () => Promise<void>
  onBackupNow: () => Promise<{ ok: boolean; backup_path: string }>
  canManageInventory: boolean
}) {
  const { t } = useTranslation()
  const [actionToast, setActionToast] = useState<{
    kind: 'ok' | 'err'
    message: string
  } | null>(null)
  const [logo, setLogo] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [backupBusy, setBackupBusy] = useState(false)
  const [stocktakeBusy, setStocktakeBusy] = useState(false)
  const [stocktakeNote, setStocktakeNote] = useState('')
  const [countByVariant, setCountByVariant] = useState<Record<string, string>>({})
  const [backupMsg, setBackupMsg] = useState<string | null>(null)
  const [form, setForm] = useState({
    brand_name: settings?.brand_name ?? '',
    phone: settings?.phone ?? '',
    address: settings?.address ?? '',
    footer_note: settings?.footer_note ?? '',
    transliterate_uz: settings?.transliterate_uz ?? true,
  })

  if (!settings) {
    return <div className="p-4">{t('admin.common.loading')}</div>
  }

  async function runAction(label: string, fn: () => Promise<void>) {
    try {
      await fn()
      setActionToast({ kind: 'ok', message: t('admin.settings.actionCompleted', { label }) })
    } catch (e: unknown) {
      const code = (e as Error & { code?: string }).code
      const message = t(`err.${code || 'UNKNOWN'}`, {
        defaultValue: t('admin.settings.actionFailed', { label }),
      })
      setActionToast({ kind: 'err', message })
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-semibold">{t('admin.settings.title')}</h2>
      {actionToast && (
        <div
          className={`px-3 py-2 rounded text-sm border ${
            actionToast.kind === 'ok'
              ? 'bg-emerald-950 border-emerald-700 text-emerald-100'
              : 'bg-red-950 border-red-700 text-red-100'
          }`}
        >
          {actionToast.message}
        </div>
      )}
      {settings.logo_url && (
        <img src={settings.logo_url} alt="logo" className="h-20 object-contain bg-white p-2 rounded" />
      )}
      <form
        className="space-y-2 max-w-2xl"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try {
            await runAction(t('admin.settings.saveSettings'), () => onSave({ ...form, logo }))
          } finally {
            setBusy(false)
          }
        }}
      >
        <input
          className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700"
          value={form.brand_name}
          onChange={(e) => setForm({ ...form, brand_name: e.target.value })}
          placeholder={t('admin.settings.brandName')}
        />
        <input
          className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder={t('admin.settings.phone')}
        />
        <input
          className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          placeholder={t('admin.settings.address')}
        />
        <input
          className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700"
          value={form.footer_note}
          onChange={(e) => setForm({ ...form, footer_note: e.target.value })}
          placeholder={t('admin.settings.footer')}
        />
        <label className="text-sm flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.transliterate_uz}
            onChange={(e) => setForm({ ...form, transliterate_uz: e.target.checked })}
          />
          {t('admin.settings.transliterate')}
        </label>
        <input type="file" accept="image/*" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
        <p className="text-xs text-slate-500">{t('admin.settings.logoHint')}</p>
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 rounded bg-emerald-700 border border-emerald-500 disabled:opacity-40"
        >
          {busy ? t('admin.common.saving') : t('admin.settings.saveSettings')}
        </button>
      </form>
      <p className="text-xs text-slate-400">
        {t('admin.settings.headerHint')}
      </p>
      <div className="flex gap-2 items-center">
        <button
          type="button"
          className="px-3 py-2 rounded bg-slate-800 border border-slate-700 disabled:opacity-50"
          disabled={backupBusy}
          onClick={async () => {
            setBackupBusy(true)
            try {
              const res = await onBackupNow()
              setBackupMsg(res.backup_path)
              setActionToast({ kind: 'ok', message: t('admin.settings.backupSuccess') })
            } catch (e: unknown) {
              const code = (e as Error & { code?: string }).code
              const message = t(`err.${code || 'BACKUP_FAILED'}`, {
                defaultValue: t('err.BACKUP_FAILED'),
              })
              setActionToast({ kind: 'err', message })
            } finally {
              setBackupBusy(false)
            }
          }}
        >
          {backupBusy ? t('admin.settings.backingUp') : t('admin.settings.backupNow')}
        </button>
        {backupMsg && <span className="text-xs text-slate-400">{backupMsg}</span>}
      </div>

      {canManageInventory && (
        <div className="pt-6 border-t border-slate-800 space-y-3">
          <h3 className="text-lg font-semibold">{t('admin.settings.stocktakeTitle')}</h3>
          {!stocktake && (
          <div className="flex gap-2">
            <input
              className="px-3 py-2 rounded bg-slate-900 border border-slate-700"
              value={stocktakeNote}
              onChange={(e) => setStocktakeNote(e.target.value)}
              placeholder={t('admin.settings.sessionNote')}
            />
            <button
              type="button"
              className="px-3 py-2 rounded bg-emerald-700 border border-emerald-500 disabled:opacity-50"
              disabled={stocktakeBusy}
              onClick={async () => {
                setStocktakeBusy(true)
                try {
                  await runAction(t('admin.settings.stocktakeStart'), () => onCreateStocktake(stocktakeNote))
                } finally {
                  setStocktakeBusy(false)
                }
              }}
            >
              {stocktakeBusy ? t('admin.settings.starting') : t('admin.settings.stocktakeStart')}
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded bg-slate-800 border border-slate-700 disabled:opacity-50"
              disabled={stocktakeBusy}
              onClick={async () => {
                setStocktakeBusy(true)
                try {
                  await runAction(t('admin.settings.stocktakeReload'), () => onReloadOpen())
                } finally {
                  setStocktakeBusy(false)
                }
              }}
            >
              {t('admin.settings.reopenSession')}
            </button>
          </div>
          )}
          {stocktake && (
          <div className="space-y-2">
            <div className="text-sm text-slate-400">
              {t('admin.settings.session')}: {stocktake.id.slice(0, 8)} | {t('admin.sales.status')}:{' '}
              {t(`status.${stocktake.status}`, { defaultValue: stocktake.status })}
            </div>
            <div className="max-h-72 overflow-auto rounded border border-slate-800">
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
                      <td className="p-2">{ln.product_name_uz}</td>
                      <td className="p-2">{ln.barcode}</td>
                      <td className="p-2 text-right">{ln.expected_qty}</td>
                      <td className="p-2 text-right">{ln.counted_qty ?? '-'}</td>
                      <td className="p-2 text-right">{ln.variance_qty}</td>
                      <td className="p-2 text-right">
                        <div className="inline-flex gap-2">
                          <input
                            className="px-2 py-1 rounded bg-slate-950 border border-slate-700 w-20"
                            value={countByVariant[ln.variant] ?? ''}
                            onChange={(e) =>
                              setCountByVariant((p) => ({ ...p, [ln.variant]: e.target.value }))
                            }
                            placeholder={t('admin.settings.qty')}
                          />
                          <button
                            type="button"
                            className="px-2 py-1 rounded bg-slate-800 border border-slate-600 disabled:opacity-50"
                            disabled={stocktakeBusy}
                            onClick={async () => {
                              setStocktakeBusy(true)
                              try {
                                await runAction(t('admin.settings.stocktakeCount'), () =>
                                  onSetCount(ln.variant, Number(countByVariant[ln.variant] || '0')),
                                )
                              } finally {
                                setStocktakeBusy(false)
                              }
                            }}
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
                className="px-3 py-2 rounded bg-amber-700 border border-amber-500 disabled:opacity-50"
                disabled={stocktakeBusy}
                onClick={async () => {
                  setStocktakeBusy(true)
                  try {
                    await runAction(t('admin.settings.stocktakeApply'), () => onApplyStocktake())
                  } finally {
                    setStocktakeBusy(false)
                  }
                }}
              >
                {t('admin.settings.applyVariance')}
              </button>
            )}
          </div>
          )}
        </div>
      )}
    </div>
  )
}
