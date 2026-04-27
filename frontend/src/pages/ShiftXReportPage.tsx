import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CashierXReport } from '../api'
import { fetchCashierXReport } from '../api'
import { formatMoney } from '../utils/money'
import { ActionToast } from '../components/ActionToast'

function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ShiftXReportPage() {
  const { t } = useTranslation()
  const [fromInput, setFromInput] = useState('')
  const [toInput, setToInput] = useState('')
  const [report, setReport] = useState<CashierXReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    setToast(null)
    try {
      const fromIso = fromInput ? new Date(fromInput).toISOString() : undefined
      const toIso = toInput ? new Date(toInput).toISOString() : undefined
      const r = await fetchCashierXReport({
        from: fromIso,
        to: toIso,
      })
      setReport(r)
      if (!fromInput && !toInput) {
        setFromInput(toLocalInputValue(r.range.from))
        setToInput(toLocalInputValue(r.range.to))
      }
    } catch {
      setToast(t('err.API_ERROR'))
    } finally {
      setBusy(false)
    }
  }, [fromInput, toInput, t])

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, [])

  return (
    <div className="p-4 space-y-4 max-w-xl">
      <h2 className="text-xl font-semibold">{t('admin.cashier.shiftTitle')}</h2>
      <p className="text-sm text-slate-400">{t('admin.cashier.shiftHint')}</p>
      {toast && <ActionToast kind="err" message={toast} onClose={() => setToast(null)} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-400 block">
          {t('admin.cashier.shiftFrom')}
          <input
            type="datetime-local"
            className="touch-btn mt-1 w-full min-h-12 px-2 rounded-xl bg-slate-900 border border-slate-700"
            value={fromInput}
            onChange={(e) => setFromInput(e.target.value)}
          />
        </label>
        <label className="text-xs text-slate-400 block">
          {t('admin.cashier.shiftTo')}
          <input
            type="datetime-local"
            className="touch-btn mt-1 w-full min-h-12 px-2 rounded-xl bg-slate-900 border border-slate-700"
            value={toInput}
            onChange={(e) => setToInput(e.target.value)}
          />
        </label>
      </div>
      <button
        type="button"
        disabled={busy}
        className="touch-btn min-h-12 px-5 rounded-xl bg-emerald-700 border border-emerald-500 font-medium disabled:opacity-40"
        onClick={() => void load()}
      >
        {busy ? t('admin.common.loading') : t('admin.cashier.shiftRefresh')}
      </button>
      {report && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-2 text-sm">
          <div className="text-slate-400">
            {t('admin.cashier.shiftCashier')}: <span className="text-slate-100 font-medium">{report.cashier_username}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <div className="text-slate-400">{t('admin.cashier.shiftSalesCount')}</div>
            <div className="text-right font-semibold tabular-nums">{report.sales_count}</div>
            <div className="text-slate-400">{t('admin.cashier.shiftCash')}</div>
            <div className="text-right font-semibold tabular-nums">{formatMoney(report.cash_total)}</div>
            <div className="text-slate-400">{t('admin.cashier.shiftCard')}</div>
            <div className="text-right font-semibold tabular-nums">{formatMoney(report.card_total)}</div>
            <div className="text-slate-400">{t('admin.cashier.shiftDebt')}</div>
            <div className="text-right font-semibold tabular-nums">{formatMoney(report.debt_total)}</div>
            <div className="text-slate-400">{t('admin.cashier.shiftTotal')}</div>
            <div className="text-right font-semibold tabular-nums">{formatMoney(report.sales_amount)}</div>
          </div>
        </div>
      )}
    </div>
  )
}
