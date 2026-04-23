import { useMemo } from 'react'
import Decimal from 'decimal.js'
import type { DebtRow, SaleHistoryRow } from '../api'
import { useTranslation } from 'react-i18next'

export function DashboardPage({
  debts,
  sales,
}: {
  debts: DebtRow[]
  sales: SaleHistoryRow[]
}) {
  const { t } = useTranslation()
  const totalDebt = useMemo(
    () => debts.reduce((acc, d) => acc.plus(d.remaining_amount || '0'), new Decimal(0)).toFixed(0),
    [debts],
  )
  const todaySales = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return sales
      .filter((s) => String(s.completed_at).startsWith(today))
      .reduce((acc, s) => acc.plus(s.grand_total || '0'), new Decimal(0))
      .toFixed(0)
  }, [sales])

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-semibold">{t('admin.dashboard.title')}</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400">{t('admin.dashboard.openDebts')}</div>
          <div className="text-2xl mt-1">{debts.length}</div>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400">{t('admin.dashboard.totalDebt')}</div>
          <div className="text-2xl mt-1">{totalDebt}</div>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400">{t('admin.dashboard.todaySales')}</div>
          <div className="text-2xl mt-1">{todaySales}</div>
        </div>
      </div>
    </div>
  )
}
