import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Decimal from 'decimal.js'
import {
  completeSale,
  fetchReceiptEscpos,
  fetchReceiptPlain,
  fetchVariantByBarcode,
  logout,
} from '../api'
import { usePosStore, type PayMode } from '../store/posStore'

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP })

type PaymentRow = {
  id: string
  method: PayMode
  amount: string
}

function roundSom(v: Decimal.Value): Decimal {
  return new Decimal(v).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
}

function parseSom(v: string): Decimal {
  const normalized = (v || '0').replace(',', '.').trim() || '0'
  try {
    return roundSom(new Decimal(normalized))
  } catch {
    return new Decimal(0)
  }
}

function beepError() {
  try {
    const ctx = new AudioContext()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g)
    g.connect(ctx.destination)
    o.frequency.value = 220
    g.gain.value = 0.08
    o.start()
    setTimeout(() => {
      o.stop()
      ctx.close()
    }, 120)
  } catch {
    // ignore
  }
}

function moneyFromLine(list: string, qty: number): string {
  return roundSom(new Decimal(list).mul(qty)).toString()
}

function sumGrand(cart: ReturnType<typeof usePosStore.getState>['cart']): string {
  let t = new Decimal(0)
  for (const l of cart) {
    t = t.plus(new Decimal(l.listPrice).mul(l.qty))
  }
  return roundSom(t).toString()
}

export function PosPage({ onLogout }: { onLogout: () => void }) {
  const { t, i18n } = useTranslation()
  const scanRef = useRef<HTMLInputElement>(null)
  const [buffer, setBuffer] = useState('')
  const [toast, setToast] = useState<{ kind: 'err' | 'ok'; msg: string } | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [scanFlash, setScanFlash] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [printBanner, setPrintBanner] = useState<string | null>(null)
  const [lastSaleId, setLastSaleId] = useState<string | null>(null)
  const [clearArmed, setClearArmed] = useState(false)

  const cart = usePosStore((s) => s.cart)
  const payMode = usePosStore((s) => s.payMode)
  const customerName = usePosStore((s) => s.customerName)
  const customerPhone = usePosStore((s) => s.customerPhone)
  const addLine = usePosStore((s) => s.addLine)
  const incQty = usePosStore((s) => s.incQty)
  const clearCart = usePosStore((s) => s.clearCart)
  const setPayMode = usePosStore((s) => s.setPayMode)
  const setCustomer = usePosStore((s) => s.setCustomer)

  const grand = sumGrand(cart)
  const grandDec = useMemo(() => parseSom(grand), [grand])

  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([
    { id: crypto.randomUUID(), method: 'CASH', amount: '0' },
  ])
  const [activePayId, setActivePayId] = useState<string | null>(null)

  const safeRefocus = useCallback(() => {
    requestAnimationFrame(() => {
      if (document.activeElement !== scanRef.current) {
        scanRef.current?.focus()
      }
    })
    window.setTimeout(() => {
      if (document.activeElement !== scanRef.current) {
        scanRef.current?.focus()
      }
    }, 50)
  }, [])

  useEffect(() => {
    safeRefocus()
  }, [safeRefocus, cart, toast, banner, completing, printBanner])

  useEffect(() => {
    if (paymentRows.length === 1) {
      setPaymentRows((prev) => [{ ...prev[0], amount: grand }])
    }
    if (paymentRows.length > 0 && !activePayId) {
      setActivePayId(paymentRows[0].id)
    }
  }, [grand, paymentRows.length, activePayId])

  function paymentTotal(): Decimal {
    return paymentRows.reduce((acc, r) => acc.plus(parseSom(r.amount)), new Decimal(0))
  }

  function setActiveMethod(method: PayMode) {
    setPayMode(method)
    setPaymentRows((prev) => {
      if (prev.length === 0) {
        const id = crypto.randomUUID()
        setActivePayId(id)
        return [{ id, method, amount: grand }]
      }
      if (!activePayId) {
        return prev.map((p, idx) => (idx === 0 ? { ...p, method } : p))
      }
      return prev.map((p) => (p.id === activePayId ? { ...p, method } : p))
    })
  }

  function addPaymentRow() {
    const id = crypto.randomUUID()
    setPaymentRows((prev) => [...prev, { id, method: payMode, amount: '0' }])
    setActivePayId(id)
  }

  function removePaymentRow(id: string) {
    setPaymentRows((prev) => {
      const next = prev.filter((r) => r.id !== id)
      if (next.length === 0) {
        const single = [{ id: crypto.randomUUID(), method: 'CASH' as PayMode, amount: grand }]
        setActivePayId(single[0].id)
        return single
      }
      if (!next.some((r) => r.id === activePayId)) {
        setActivePayId(next[0].id)
      }
      return next
    })
  }

  function updatePaymentRow(id: string, patch: Partial<PaymentRow>) {
    setPaymentRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function showToast(kind: 'err' | 'ok', msg: string) {
    setToast({ kind, msg })
    setTimeout(() => setToast(null), 4000)
  }

  async function tryPrint(saleId: string) {
    setPrintBanner(null)
    const b64 = await fetchReceiptEscpos(saleId)
    let ok = false
    if (b64) {
      try {
        const { invoke } = await import('@tauri-apps/api/tauri')
        await invoke('print_escpos', { payload: b64 })
        ok = true
      } catch {
        ok = false
      }
    }
    if (!ok) {
      const plain = await fetchReceiptPlain(saleId)
      if (plain) {
        try {
          const { invoke } = await import('@tauri-apps/api/tauri')
          await invoke('print_plain', { text: plain })
          ok = true
        } catch {
          try {
            await navigator.clipboard.writeText(plain)
            setPrintBanner(t('msg.printClipboard'))
          } catch {
            setPrintBanner(t('msg.printFailed'))
          }
        }
      }
    }
    if (ok) showToast('ok', t('msg.printSent'))
    safeRefocus()
  }

  async function handleScanSubmit(code: string) {
    const c = code.trim()
    if (!c) return
    try {
      const v = await fetchVariantByBarcode(c)
      addLine({
        variantId: v.id,
        barcode: v.barcode,
        name: v.product_name_uz,
        sizeLabel: v.size_label_uz,
        colorLabel: v.color_label_uz,
        listPrice: String(v.list_price),
        qty: 1,
      })
      setBuffer('')
      safeRefocus()
    } catch (e: unknown) {
      beepError()
      setScanFlash(true)
      setTimeout(() => setScanFlash(false), 400)
      const code = (e as Error & { code?: string }).code
      const msg =
        code === 'BARCODE_NOT_FOUND'
          ? `${t('msg.scanNotFound')}: ${c}`
          : t(`err.${code || 'API_ERROR'}`, { defaultValue: t('msg.scanApi') })
      showToast('err', msg)
      setBuffer('')
      safeRefocus()
    }
  }

  async function doComplete() {
    if (completing || cart.length === 0) return

    const pays = paymentRows.map((r) => ({ method: r.method, amount: parseSom(r.amount) }))
    const payTotal = pays.reduce((acc, p) => acc.plus(p.amount), new Decimal(0))

    if (!payTotal.eq(grandDec)) {
      beepError()
      setBanner(`${t('msg.paymentMismatch')} (${payTotal.toString()} / ${grandDec.toString()})`)
      safeRefocus()
      return
    }

    const hasDebt = pays.some((p) => p.method === 'DEBT' && p.amount.gt(0))
    if (hasDebt && (!customerPhone.trim() || !customerName.trim())) {
      beepError()
      setBanner(t('msg.debtRequired'))
      safeRefocus()
      return
    }

    setBanner(null)
    setCompleting(true)
    const idem = crypto.randomUUID()

    try {
      const lines = cart.map((l) => ({
        variant_id: l.variantId,
        qty: l.qty,
        line_discount: '0',
      }))
      const payments = pays.map((p) => ({ method: p.method, amount: p.amount.toString() }))
      const customer = hasDebt
        ? {
            name: customerName.trim(),
            phone_normalized: customerPhone.trim(),
          }
        : undefined

      const res = await completeSale(
        {
          lines,
          payments,
          customer,
          expected_grand_total: grandDec.toString(),
        },
        idem,
      )
      setLastSaleId(res.sale_id)
      clearCart()
      setPaymentRows([{ id: crypto.randomUUID(), method: 'CASH', amount: '0' }])
      setActivePayId(null)
      showToast('ok', `${t('msg.sale')}: ${res.sale_id}`)
      setTimeout(() => setCompleting(false), 400)
      void tryPrint(res.sale_id as string)
    } catch (e: unknown) {
      beepError()
      const code = (e as Error & { code?: string }).code
      const msg = t(`err.${code || 'UNKNOWN'}`, { defaultValue: t('msg.errorGeneric') })
      if (code === 'INSUFFICIENT_STOCK') {
        setBanner(`${t('msg.stock')} ${msg}`)
      } else {
        setBanner(msg)
      }
      showToast('err', msg)
      setCompleting(false)
    }
    safeRefocus()
  }

  function onScanKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (buffer.trim()) {
        void handleScanSubmit(buffer)
      } else if (cart.length > 0 && !completing) {
        void doComplete()
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      if (cart.length > 0) {
        if (e.shiftKey || clearArmed) {
          clearCart()
          setClearArmed(false)
        } else {
          setClearArmed(true)
          setBanner(t('msg.clearCartConfirm'))
        }
      }
      setBuffer('')
      safeRefocus()
      return
    }
    if (e.key === 'F1') {
      e.preventDefault()
      setActiveMethod('CASH')
      return
    }
    if (e.key === 'F2') {
      e.preventDefault()
      setActiveMethod('CARD')
      return
    }
    if (e.key === 'F3') {
      e.preventDefault()
      setActiveMethod('DEBT')
      return
    }
  }

  function onScanChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    if (v.includes('\t')) {
      const code = v.replace('\t', '').trim()
      setBuffer('')
      void handleScanSubmit(code)
      return
    }
    setBuffer(v)
  }

  const payTotalView = paymentTotal().toString()

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{t('app.title')}</span>
          <button
            type="button"
            className={`text-xs px-2 py-1 rounded border ${
              i18n.language.startsWith('uz')
                ? 'bg-emerald-700 border-emerald-500 text-white'
                : 'bg-slate-800 border-slate-600 text-slate-200'
            }`}
            onClick={() => i18n.changeLanguage('uz')}
          >
            {t('lang.uz')}
          </button>
          <button
            type="button"
            className={`text-xs px-2 py-1 rounded border ${
              i18n.language.startsWith('ru')
                ? 'bg-emerald-700 border-emerald-500 text-white'
                : 'bg-slate-800 border-slate-600 text-slate-200'
            }`}
            onClick={() => i18n.changeLanguage('ru')}
          >
            {t('lang.ru')}
          </button>
        </div>
        <div className="flex gap-2 items-center">
          {lastSaleId && (
            <button
              type="button"
              className="text-sm px-2 py-1 rounded bg-slate-800 border border-slate-600"
              onClick={() => lastSaleId && void tryPrint(lastSaleId)}
            >
              {t('header.reprint')}
            </button>
          )}
          <button
            type="button"
            className="text-sm text-slate-400 hover:text-white"
            onClick={async () => {
              await logout()
              onLogout()
            }}
          >
            {t('header.logout')}
          </button>
        </div>
      </header>

      {toast && (
        <div
          className={`mx-4 mt-3 px-3 py-2 rounded text-sm ${
            toast.kind === 'err'
              ? 'bg-red-900/80 border border-red-700 text-red-100'
              : 'bg-emerald-900/80 border border-emerald-700 text-emerald-100'
          }`}
        >
          {toast.msg}
        </div>
      )}
      {banner && (
        <div className="mx-4 mt-2 px-3 py-2 rounded text-sm bg-red-950 border border-red-800 text-red-100">
          {banner}
          <button
            type="button"
            className="ml-2 underline text-white"
            onClick={() => {
              setBanner(null)
              setClearArmed(false)
              safeRefocus()
            }}
          >
            {t('msg.close')}
          </button>
        </div>
      )}
      {printBanner && (
        <div className="mx-4 mt-2 px-3 py-2 rounded text-sm bg-amber-950 border border-amber-800">
          {printBanner}
        </div>
      )}

      <main className="flex-1 flex flex-col md:flex-row gap-4 p-4">
        <section className="flex-1 flex flex-col gap-3">
          <label className="text-xs text-slate-400">{t('scan.label')}</label>
          <input
            ref={scanRef}
            id="posScanInput"
            value={buffer}
            onChange={onScanChange}
            onKeyDown={onScanKeyDown}
            className={`w-full text-lg px-3 py-3 rounded border bg-slate-900 outline-none ${
              scanFlash ? 'border-red-500 ring-2 ring-red-600' : 'border-slate-600'
            }`}
            placeholder={t('scan.placeholder')}
            autoComplete="off"
          />
          <p className="text-xs text-slate-500">{t('scan.hint')}</p>

          <div className="rounded border border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="text-left p-2">{t('cart.title')}</th>
                  <th className="p-2">{t('cart.qty')}</th>
                  <th className="text-right p-2">{t('cart.sum')}</th>
                </tr>
              </thead>
              <tbody>
                {cart.map((l) => (
                  <tr key={l.variantId} className="border-t border-slate-800">
                    <td className="p-2">
                      <div className="font-medium">{l.name}</div>
                      <div className="text-xs text-slate-400">
                        {l.colorLabel} / {l.sizeLabel} - {l.barcode}
                      </div>
                    </td>
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        className="px-2 py-0.5 bg-slate-800 rounded"
                        onClick={() => incQty(l.variantId, -1)}
                      >
                        -
                      </button>
                      <span className="mx-2">{l.qty}</span>
                      <button
                        type="button"
                        className="px-2 py-0.5 bg-slate-800 rounded"
                        onClick={() => incQty(l.variantId, 1)}
                      >
                        +
                      </button>
                    </td>
                    <td className="p-2 text-right">{moneyFromLine(l.listPrice, l.qty)}</td>
                  </tr>
                ))}
                {cart.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-6 text-center text-slate-500">
                      {t('cart.empty')}
                      <div className="text-xs text-slate-400 mt-1">{t('cart.emptyHint')}</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="w-full md:w-96 flex flex-col gap-3">
          <div className="rounded border border-slate-800 p-3 bg-slate-900">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-400">{t('pay.split')}</div>
              <button
                type="button"
                className="px-2 py-1 text-xs rounded bg-slate-800 border border-slate-600"
                onClick={addPaymentRow}
              >
                {t('pay.addRow')}
              </button>
            </div>

            <div className="space-y-2">
              {paymentRows.map((r, idx) => (
                <div
                  key={r.id}
                  className={`grid grid-cols-[1fr_1fr_auto] gap-2 p-2 rounded border ${
                    activePayId === r.id ? 'border-emerald-500 bg-slate-950' : 'border-slate-700'
                  }`}
                  onClick={() => setActivePayId(r.id)}
                >
                  <select
                    className="px-2 py-2 rounded bg-slate-900 border border-slate-600 text-sm"
                    value={r.method}
                    onChange={(e) => updatePaymentRow(r.id, { method: e.target.value as PayMode })}
                  >
                    <option value="CASH">{t('pay.method.cash')}</option>
                    <option value="CARD">{t('pay.method.card')}</option>
                    <option value="DEBT">{t('pay.method.debt')}</option>
                  </select>
                  <input
                    className="px-2 py-2 rounded bg-slate-900 border border-slate-600 text-sm"
                    value={r.amount}
                    onChange={(e) => updatePaymentRow(r.id, { amount: e.target.value })}
                  />
                  <button
                    type="button"
                    className="px-2 py-1 rounded bg-slate-800 border border-slate-600 text-xs"
                    onClick={() => removePaymentRow(r.id)}
                    disabled={paymentRows.length === 1}
                    title={`${t('pay.addRow')} #${idx + 1}`}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-2 text-xs text-slate-400">
              {t('pay.total')}: {payTotalView} / {t('pay.grand')}: {grand}
            </div>

            <div className="mt-2 flex gap-2 flex-wrap">
              {(['CASH', 'CARD', 'DEBT'] as PayMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setActiveMethod(m)}
                  className={`px-3 py-2 rounded text-sm border ${
                    payMode === m ? 'bg-emerald-700 border-emerald-500' : 'bg-slate-800 border-slate-600'
                  }`}
                >
                  {m === 'CASH' && `F1 ${t('pay.mode.cash')}`}
                  {m === 'CARD' && `F2 ${t('pay.mode.card')}`}
                  {m === 'DEBT' && `F3 ${t('pay.mode.debt')}`}
                </button>
              ))}
            </div>
          </div>

          {paymentRows.some((p) => p.method === 'DEBT' && parseSom(p.amount).gt(0)) && (
            <div className="rounded border border-slate-800 p-3 bg-slate-900 space-y-2">
              <div className="text-sm text-slate-400">{t('pay.customer')}</div>
              <input
                className="w-full px-2 py-2 rounded bg-slate-950 border border-slate-700 text-sm"
                placeholder={t('pay.customerName')}
                value={customerName}
                onChange={(e) => setCustomer(e.target.value, customerPhone)}
              />
              <input
                className="w-full px-2 py-2 rounded bg-slate-950 border border-slate-700 text-sm"
                placeholder={t('pay.customerPhone')}
                value={customerPhone}
                onChange={(e) => setCustomer(customerName, e.target.value)}
              />
            </div>
          )}

          <div className="rounded border border-slate-800 p-4 bg-slate-900">
            <div className="text-slate-400 text-sm">{t('summary.total')}</div>
            <div className="text-3xl font-bold mt-1">{grand}</div>
            <button
              type="button"
              disabled={completing || cart.length === 0}
              className="mt-4 w-full py-3 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 font-semibold"
              onClick={() => void doComplete()}
            >
              {completing ? t('summary.saving') : t('summary.complete')}
            </button>
          </div>
        </aside>
      </main>
    </div>
  )
}
