import { useMemo, useState } from 'react'
import Decimal from 'decimal.js'
import type { DebtRow } from '../api'
import { useTranslation } from 'react-i18next'

export function DebtsPage({
  debts,
  onRepay,
}: {
  debts: DebtRow[]
  onRepay: (customerId: string, amount: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [amountByCustomer, setAmountByCustomer] = useState<Record<string, string>>({})
  const totals = useMemo(() => {
    const grouped: Record<string, Decimal> = {}
    for (const d of debts) {
      grouped[d.customer] = (grouped[d.customer] ?? new Decimal(0)).plus(d.remaining_amount || '0')
    }
    return grouped
  }, [debts])

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-semibold">{t('admin.debts.title')}</h2>
      <p className="text-xs text-slate-400">{t('admin.debts.hint')}</p>
      <div className="rounded border border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="text-left p-2">{t('admin.debts.customer')}</th>
              <th className="text-left p-2">{t('admin.debts.phone')}</th>
              <th className="text-right p-2">{t('admin.debts.openCount')}</th>
              <th className="text-right p-2">{t('admin.debts.totalRemaining')}</th>
              <th className="text-right p-2">{t('admin.debts.repay')}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(totals).map(([customerId, total]) => {
              const row = debts.find((d) => d.customer === customerId)
              if (!row) return null
              const count = debts.filter((d) => d.customer === customerId).length
              return (
                <tr key={customerId} className="border-t border-slate-800">
                  <td className="p-2">{row.customer_name}</td>
                  <td className="p-2">{row.customer_phone}</td>
                  <td className="p-2 text-right">{count}</td>
                  <td className="p-2 text-right">{total.toFixed(0)}</td>
                  <td className="p-2 text-right">
                    <div className="inline-flex gap-2">
                      <input
                        className="px-2 py-1 rounded bg-slate-950 border border-slate-700 w-24"
                        placeholder={t('admin.debts.amountPlaceholder')}
                        value={amountByCustomer[customerId] ?? ''}
                        onChange={(e) =>
                          setAmountByCustomer((p) => ({ ...p, [customerId]: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="px-2 py-1 rounded bg-emerald-700 border border-emerald-500"
                        onClick={() =>
                          void onRepay(customerId, amountByCustomer[customerId] || '0')
                        }
                      >
                        {t('admin.debts.repay')}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {debts.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-500">
                  {t('admin.debts.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
