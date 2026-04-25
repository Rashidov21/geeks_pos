import { useMemo, useState } from 'react'
import Decimal from 'decimal.js'
import type { DebtRow } from '../api'
import { useTranslation } from 'react-i18next'
import { formatMoney } from '../utils/money'
import { ActionToast } from '../components/ActionToast'

export function DebtsPage({
  debts,
  onRepay,
  onSendReminder,
  onUpdateCustomer,
}: {
  debts: DebtRow[]
  onRepay: (customerId: string, amount: string) => Promise<void>
  onSendReminder: (customerId: string, amount: string) => Promise<void>
  onUpdateCustomer: (customerId: string, name: string, phone: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [amountByCustomer, setAmountByCustomer] = useState<Record<string, string>>({})
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [busyCustomerId, setBusyCustomerId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null)
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
      {toast && <ActionToast kind={toast.kind} message={toast.message} onClose={() => setToast(null)} />}
      <p className="text-xs text-slate-400">{t('admin.debts.hint')}</p>
      <div className="rounded border border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="text-left p-2">{t('admin.debts.customer')}</th>
              <th className="text-left p-2">{t('admin.debts.phone')}</th>
              <th className="text-left p-2">{t('admin.debts.createdAt')}</th>
              <th className="text-left p-2">{t('admin.debts.dueDate')}</th>
              <th className="text-right p-2">{t('admin.debts.openCount')}</th>
              <th className="text-right p-2">{t('admin.debts.totalRemaining')}</th>
              <th className="text-right p-2">{t('admin.debts.repay')}</th>
              <th className="text-right p-2">{t('admin.debts.reminder')}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(totals).map(([customerId, total]) => {
              const row = debts.find((d) => d.customer === customerId)
              if (!row) return null
              const count = debts.filter((d) => d.customer === customerId).length
              return (
                <tr key={customerId} className="border-t border-slate-800">
                  <td className="p-2">
                    {editingCustomerId === customerId ? (
                      <input
                        className="touch-btn min-h-12 w-full px-3 rounded-xl bg-slate-950 border border-slate-700 text-sm"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder={t('admin.debts.customer')}
                      />
                    ) : (
                      row.customer_name
                    )}
                  </td>
                  <td className="p-2">
                    {editingCustomerId === customerId ? (
                      <input
                        className="touch-btn min-h-12 w-full px-3 rounded-xl bg-slate-950 border border-slate-700 text-sm"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, ''))}
                        placeholder="998901112233"
                      />
                    ) : (
                      row.customer_phone
                    )}
                  </td>
                  <td className="p-2">{new Date(row.created_at).toLocaleDateString()}</td>
                  <td className="p-2">
                    {row.due_date ? (
                      <span className={new Date(row.due_date) < new Date() ? 'text-amber-300' : ''}>
                        {new Date(row.due_date).toLocaleDateString()}
                        {new Date(row.due_date) < new Date() ? ` (${t('admin.debts.overdue')})` : ''}
                      </span>
                    ) : (
                      <span className="text-slate-500">{t('admin.debts.noDueDate')}</span>
                    )}
                  </td>
                  <td className="p-2 text-right">{count}</td>
                  <td className="p-2 text-right">{formatMoney(total.toFixed(0))}</td>
                  <td className="p-2 text-right">
                    <div className="inline-flex gap-2">
                      <input
                        className="touch-btn min-h-12 px-3 rounded-xl bg-slate-950 border border-slate-700 w-28 text-sm"
                        placeholder={t('admin.debts.amountPlaceholder')}
                        value={amountByCustomer[customerId] ?? ''}
                        onChange={(e) =>
                          setAmountByCustomer((p) => ({ ...p, [customerId]: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        disabled={busyCustomerId === customerId}
                        className="touch-btn min-h-12 px-4 rounded-xl bg-emerald-700 border border-emerald-500 text-sm font-medium"
                        onClick={async () => {
                          setBusyCustomerId(customerId)
                          try {
                            await onRepay(customerId, amountByCustomer[customerId] || '0')
                            setToast({ kind: 'ok', message: t('admin.debts.repaySuccess') })
                          } catch (e: unknown) {
                            const code = (e as Error & { code?: string }).code
                            setToast({ kind: 'err', message: t(`err.${code || 'DEBT_PAYMENT_FAILED'}`) })
                          } finally {
                            setBusyCustomerId(null)
                          }
                        }}
                      >
                        {t('admin.debts.repay')}
                      </button>
                    </div>
                  </td>
                  <td className="p-2 text-right">
                    <div className="inline-flex gap-2">
                      {editingCustomerId === customerId ? (
                        <>
                          <button
                            type="button"
                            disabled={busyCustomerId === customerId || !editName.trim() || !editPhone.trim()}
                            className="touch-btn min-h-12 px-4 rounded-xl bg-emerald-700 border border-emerald-500 text-sm font-medium disabled:opacity-50"
                            onClick={async () => {
                              if (!/^\d{9,15}$/.test(editPhone.trim())) {
                                setToast({
                                  kind: 'err',
                                  message: "Telefon raqami davlat kodi bilan, '+'siz kiritilishi kerak (masalan: 998901112233).",
                                })
                                return
                              }
                              setBusyCustomerId(customerId)
                              try {
                                await onUpdateCustomer(customerId, editName.trim(), editPhone.trim())
                                setToast({ kind: 'ok', message: t('admin.common.save') })
                                setEditingCustomerId(null)
                              } catch (e: unknown) {
                                const code = (e as Error & { code?: string }).code
                                setToast({ kind: 'err', message: t(`err.${code || 'VALIDATION_ERROR'}`) })
                              } finally {
                                setBusyCustomerId(null)
                              }
                            }}
                          >
                            {t('admin.common.save')}
                          </button>
                          <button
                            type="button"
                            disabled={busyCustomerId === customerId}
                            className="touch-btn min-h-12 px-4 rounded-xl bg-slate-800 border border-slate-600 text-sm"
                            onClick={() => setEditingCustomerId(null)}
                          >
                            {t('admin.common.cancel')}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={busyCustomerId === customerId}
                            className="touch-btn min-h-12 px-4 rounded-xl bg-slate-800 border border-slate-600 text-sm hidden"
                            onClick={async () => {
                              setBusyCustomerId(customerId)
                              try {
                                await onSendReminder(customerId, total.toFixed(0))
                                setToast({ kind: 'ok', message: t('admin.debts.reminderSuccess') })
                              } catch (e: unknown) {
                                const code = (e as Error & { code?: string }).code
                                setToast({ kind: 'err', message: t(`err.${code || 'WHATSAPP_SEND_FAILED'}`) })
                              } finally {
                                setBusyCustomerId(null)
                              }
                            }}
                          >
                            {t('admin.debts.reminder')}
                          </button>
                          <button
                            type="button"
                            disabled={busyCustomerId === customerId}
                            className="touch-btn min-h-12 px-4 rounded-xl bg-indigo-700 border border-indigo-500 text-sm"
                            onClick={() => {
                              setEditingCustomerId(customerId)
                              setEditName(row.customer_name)
                              setEditPhone(row.customer_phone)
                            }}
                          >
                            {t('admin.catalog.edit')}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {debts.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-500">
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
