import type { DashboardSummary } from '../api'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatMoney } from '../utils/money'
import { ActionToast } from '../components/ActionToast'
import {
  BadgeDollarSign,
  Ban,
  CalendarClock,
  CircleDollarSign,
  CreditCard,
  MessageCircle,
  Package,
  Send,
  ShoppingCart,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from 'lucide-react'

export function DashboardPage({
  summary,
  licenseStatus,
  filter,
  primaryChannel,
  onFilter,
  onSendZReport,
}: {
  summary: DashboardSummary | null
  licenseStatus?: { valid?: boolean; expires_at?: string | null; last_check_message?: string } | null
  filter: { from?: string; to?: string; year?: string }
  primaryChannel: 'telegram' | 'whatsapp' | 'both'
  onFilter: (from?: string, to?: string, year?: string) => void
  onSendZReport: () => Promise<unknown>
}) {
  const { t } = useTranslation()
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const totals = summary?.totals
  const ReportIcon = primaryChannel === 'whatsapp' ? MessageCircle : Send

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-semibold">{t('admin.dashboard.title')}</h2>
      {toast && <ActionToast kind={toast.kind} message={toast.message} onClose={() => setToast(null)} />}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400 inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            {t('license.title', { defaultValue: 'License' })}
          </div>
          <div
            className={`text-lg mt-1 font-medium ${
              licenseStatus?.valid === false ? 'text-red-300' : 'text-emerald-300'
            }`}
          >
            {licenseStatus?.valid === false ? t('status.BLOCKED') : t('status.ACTIVE')}
          </div>
          {licenseStatus?.expires_at && (
            <div className="text-xs text-slate-500 mt-1">
              {t('license.expiresLabel', { defaultValue: 'Expires' })}: {licenseStatus.expires_at}
            </div>
          )}
        </div>
        <div className="rounded border border-slate-700 bg-slate-900 p-4 md:col-span-2">
          <div className="text-sm text-slate-400 mb-2">{t('admin.dashboard.quickActions', { defaultValue: 'Quick Actions' })}</div>
          <button
            type="button"
            disabled={busy}
            className="touch-btn min-h-12 px-5 py-3 rounded-xl bg-slate-800 border border-slate-600 disabled:opacity-40 text-sm font-medium"
            onClick={async () => {
              setBusy(true)
              try {
                const out = (await onSendZReport()) as {
                  ok?: boolean
                  channel_results?: Partial<Record<'telegram' | 'whatsapp', { ok: boolean }>>
                }
                const tg = out.channel_results?.telegram?.ok
                const wa = out.channel_results?.whatsapp?.ok
                const bothOk = tg && wa
                const msg = bothOk ? t('admin.bots.zReportSentBoth') : tg ? t('admin.bots.zReportSentTelegram') : wa ? t('admin.bots.zReportSentWhatsapp') : t('admin.bots.zReportSent')
                setToast({ kind: 'ok', message: msg })
              } catch (e: unknown) {
                const code = (e as Error & { code?: string }).code
                setToast({ kind: 'err', message: t(`err.${code || 'ZREPORT_SEND_FAILED'}`) })
              } finally {
                setBusy(false)
              }
            }}
          >
            <ReportIcon className="h-4 w-4 inline mr-2" />
            {t('admin.bots.sendZReport')}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400 inline-flex items-center gap-2">
            <CircleDollarSign className="h-4 w-4" />
            {t('admin.dashboard.salesAmount')}
          </div>
          <div className="text-2xl mt-1">{formatMoney(totals?.sales_amount)}</div>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400 inline-flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            {t('admin.dashboard.netProfit')}
          </div>
          <div className="text-2xl mt-1">{formatMoney(totals?.net_profit)}</div>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400 inline-flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            {t('admin.dashboard.salesCount')}
          </div>
          <div className="text-2xl mt-1">{totals?.sales_count ?? 0}</div>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400 inline-flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            {t('admin.dashboard.todaySales')}
          </div>
          <div className="text-2xl mt-1">{formatMoney(totals?.today_sales_amount)}</div>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400 inline-flex items-center gap-2">
            <WalletCards className="h-4 w-4" />
            {t('admin.dashboard.totalDebt')}
          </div>
          <div className="text-2xl mt-1">{formatMoney(totals?.open_debt_total)}</div>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400 inline-flex items-center gap-2">
            <Package className="h-4 w-4" /> {t('admin.dashboard.inventoryItems')}
          </div>
          <div className="text-2xl mt-1">{totals?.inventory_items ?? 0}</div>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400 inline-flex items-center gap-2">
            <BadgeDollarSign className="h-4 w-4" />
            {t('admin.dashboard.inventoryValue')}
          </div>
          <div className="text-2xl mt-1">{formatMoney(totals?.inventory_sale_value)}</div>
        </div>
    
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded border border-slate-700 bg-slate-900 p-3">
          <h3 className="font-medium mb-2 inline-flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> {t('admin.dashboard.topProducts')}
          </h3>
          <ul className="text-sm space-y-1">
            {(summary?.top_products ?? []).map((p) => (
              <li key={p.name} className="flex justify-between">
                <span>{p.name}</span>
                <span>{p.qty}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900 p-3">
          <h3 className="font-medium mb-2 inline-flex items-center gap-2">
            <TrendingDown className="h-4 w-4" /> {t('admin.dashboard.lowProducts')}
          </h3>
          <ul className="text-sm space-y-1">
            {(summary?.low_products ?? []).map((p) => (
              <li key={p.name} className="flex justify-between">
                <span>{p.name}</span>
                <span>{p.qty}</span>
              </li>
            ))}
          </ul>
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
          <div className="text-sm text-slate-400 inline-flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            {t('admin.dashboard.openDebts')}
          </div>
          <div className="text-2xl mt-1">{totals?.open_debt_count ?? 0}</div>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400 inline-flex items-center gap-2">
            <Ban className="h-4 w-4" />
            {t('admin.dashboard.voidCount')}
          </div>
          <div className="text-2xl mt-1">{totals?.void_count ?? 0}</div>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400 inline-flex items-center gap-2">
            <CircleDollarSign className="h-4 w-4" />
            {t('admin.dashboard.avgCheck')}
          </div>
          <div className="text-2xl mt-1">{formatMoney(totals?.avg_check)}</div>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400 inline-flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            {t('admin.dashboard.grossProfit')}
          </div>
          <div className="text-2xl mt-1">{formatMoney(totals?.gross_profit)}</div>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400 inline-flex items-center gap-2">
            <TrendingDown className="h-4 w-4" />
            {t('admin.dashboard.totalDiscounts')}
          </div>
          <div className="text-2xl mt-1">{formatMoney(totals?.total_discounts)}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
        <label className="text-xs text-slate-400">
          {t('admin.dashboard.year', { defaultValue: 'Yil' })}
          <input className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2" value={filter.year || ''} onChange={(e) => onFilter(undefined, undefined, e.target.value)} placeholder="2026" />
        </label>
        <label className="text-xs text-slate-400">
          {t('admin.common.from')}
          <input type="date" className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2" value={filter.from || ''} onChange={(e) => onFilter(e.target.value, filter.to, undefined)} />
        </label>
        <label className="text-xs text-slate-400">
          {t('admin.common.to')}
          <input type="date" className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2" value={filter.to || ''} onChange={(e) => onFilter(filter.from, e.target.value, undefined)} />
        </label>
        <button
          type="button"
          disabled={busy}
          className="touch-btn min-h-12 px-5 py-3 rounded-xl bg-slate-800 border border-slate-600 disabled:opacity-40 text-sm font-medium"
          onClick={() => onFilter(undefined, undefined, filter.year)}
        >
          {t('admin.common.apply')}
        </button>
      </div>
    </div>
  )
}
