import type { DashboardSummary } from '../api'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatMoney } from '../utils/money'

export function DashboardPage({
  summary,
  onSendZReport,
}: {
  summary: DashboardSummary | null
  onSendZReport: () => Promise<unknown>
}) {
  const { t } = useTranslation()
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const totals = summary?.totals

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-semibold">{t('admin.dashboard.title')}</h2>
      {toast && <div className="px-3 py-2 rounded border border-slate-700 bg-slate-900 text-sm">{toast}</div>}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={busy}
          className="touch-btn min-h-12 px-5 py-3 rounded-xl bg-slate-800 border border-slate-600 disabled:opacity-40 text-sm font-medium"
          onClick={async () => {
            setBusy(true)
            try {
              await onSendZReport()
              setToast(t('admin.bots.zReportSent'))
            } catch (e: unknown) {
              const code = (e as Error & { code?: string }).code
              setToast(t(`err.${code || 'TELEGRAM_SEND_FAILED'}`))
            } finally {
              setBusy(false)
            }
          }}
        >
          {t('admin.bots.sendZReport')}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400">{t('admin.dashboard.salesCount')}</div>
          <div className="text-2xl mt-1">{totals?.sales_count ?? 0}</div>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400">{t('admin.dashboard.salesAmount')}</div>
          <div className="text-2xl mt-1">{formatMoney(totals?.sales_amount)}</div>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400">{t('admin.dashboard.todaySales')}</div>
          <div className="text-2xl mt-1">{formatMoney(totals?.today_sales_amount)}</div>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400">{t('admin.dashboard.totalDebt')}</div>
          <div className="text-2xl mt-1">{formatMoney(totals?.open_debt_total)}</div>
        </div>
      </div>
      <div className="rounded border border-slate-700 bg-slate-900 p-3">
        <h3 className="font-medium mb-2">{t('admin.dashboard.topCashiers')}</h3>
        <table className="w-full text-sm">
          <thead className="text-slate-400">
            <tr>
              <th className="text-left p-2">{t('admin.sales.cashier')}</th>
              <th className="text-right p-2">{t('admin.dashboard.salesCount')}</th>
              <th className="text-right p-2">{t('admin.sales.total')}</th>
            </tr>
          </thead>
          <tbody>
            {(summary?.top_cashiers ?? []).map((row) => (
              <tr key={row.cashier} className="border-t border-slate-800">
                <td className="p-2">{row.cashier}</td>
                <td className="p-2 text-right">{row.sales_count}</td>
                <td className="p-2 text-right">{formatMoney(row.sales_amount)}</td>
              </tr>
            ))}
            {(summary?.top_cashiers ?? []).length === 0 && (
              <tr>
                <td colSpan={3} className="p-4 text-center text-slate-500">{t('admin.sales.empty')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400">{t('admin.dashboard.openDebts')}</div>
          <div className="text-2xl mt-1">{totals?.open_debt_count ?? 0}</div>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400">{t('admin.dashboard.voidCount')}</div>
          <div className="text-2xl mt-1">{totals?.void_count ?? 0}</div>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400">{t('admin.dashboard.avgCheck')}</div>
          <div className="text-2xl mt-1">{formatMoney(totals?.avg_check)}</div>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400">{t('admin.dashboard.grossProfit')}</div>
          <div className="text-2xl mt-1">{formatMoney(totals?.gross_profit)}</div>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400">{t('admin.dashboard.totalDiscounts')}</div>
          <div className="text-2xl mt-1">{formatMoney(totals?.total_discounts)}</div>
        </div>
      </div>
    </div>
  )
}
