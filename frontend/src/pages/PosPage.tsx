import { useCallback, useEffect, useRef, useState } from 'react'
import {
  completeSale,
  fetchReceiptEscpos,
  fetchReceiptPlain,
  fetchVariantByBarcode,
  logout,
} from '../api'
import { usePosStore, type PayMode } from '../store/posStore'

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
    /* ignore */
  }
}

function moneyFromLine(list: string, qty: number): string {
  const n = (parseFloat(list) * qty).toFixed(2)
  return n
}

function sumGrand(cart: ReturnType<typeof usePosStore.getState>['cart']): string {
  let t = 0
  for (const l of cart) {
    t += parseFloat(l.listPrice) * l.qty
  }
  return t.toFixed(2)
}

export function PosPage({ onLogout }: { onLogout: () => void }) {
  const scanRef = useRef<HTMLInputElement>(null)
  const [buffer, setBuffer] = useState('')
  const [toast, setToast] = useState<{ kind: 'err' | 'ok'; msg: string } | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [scanFlash, setScanFlash] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [printBanner, setPrintBanner] = useState<string | null>(null)
  const [lastSaleId, setLastSaleId] = useState<string | null>(null)

  const cart = usePosStore((s) => s.cart)
  const payMode = usePosStore((s) => s.payMode)
  const customerName = usePosStore((s) => s.customerName)
  const customerPhone = usePosStore((s) => s.customerPhone)
  const addLine = usePosStore((s) => s.addLine)
  const incQty = usePosStore((s) => s.incQty)
  const clearCart = usePosStore((s) => s.clearCart)
  const setPayMode = usePosStore((s) => s.setPayMode)
  const setCustomer = usePosStore((s) => s.setCustomer)

  const refocusScan = useCallback(() => {
    requestAnimationFrame(() => scanRef.current?.focus())
  }, [])

  useEffect(() => {
    refocusScan()
  }, [refocusScan, cart, toast, banner, completing, printBanner])

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
            setPrintBanner('Chek buferga nusxalandi (printer yo‘q / Tauri).')
          } catch {
            setPrintBanner('Chek chiqarilmadi. Qayta urinib ko‘ring.')
          }
        }
      }
    }
    if (ok) showToast('ok', 'Chek yuborildi')
    refocusScan()
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
      refocusScan()
    } catch (e: unknown) {
      beepError()
      setScanFlash(true)
      setTimeout(() => setScanFlash(false), 400)
      const msg =
        e instanceof Error && (e as Error & { code?: string }).code === 'BARCODE_NOT_FOUND'
          ? `Barcode topilmadi: ${c}`
          : 'Barcode xato / API'
      showToast('err', msg)
      setBuffer('')
      refocusScan()
    }
  }

  async function doComplete() {
    if (completing || cart.length === 0) return
    const grand = sumGrand(cart)
    if (payMode === 'DEBT' && (!customerPhone.trim() || !customerName.trim())) {
      beepError()
      setBanner('Nasiya: mijoz ism va telefon majburiy.')
      refocusScan()
      return
    }
    setBanner(null)
    setCompleting(true)
    const idem = crypto.randomUUID()
    try {
      const lines = cart.map((l) => ({
        variant_id: l.variantId,
        qty: l.qty,
        line_discount: '0.00',
      }))
      const payments = [{ method: payMode, amount: grand }]
      const customer =
        payMode === 'DEBT'
          ? {
              name: customerName.trim(),
              phone_normalized: customerPhone.trim(),
            }
          : undefined
      const res = await completeSale({ lines, payments, customer }, idem)
      setLastSaleId(res.sale_id)
      clearCart()
      showToast('ok', `Savdo: ${res.sale_id}`)
      setTimeout(() => setCompleting(false), 400)
      void tryPrint(res.sale_id as string)
    } catch (e: unknown) {
      beepError()
      const code = (e as Error & { code?: string }).code
      const msg = e instanceof Error ? e.message : 'Xato'
      if (code === 'INSUFFICIENT_STOCK') {
        setBanner(`Zaxira yetarli emas. ${msg}`)
      } else {
        setBanner(msg)
      }
      showToast('err', msg)
      setCompleting(false)
    }
    refocusScan()
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
        if (e.shiftKey) clearCart()
        else if (confirm('Savatni tozalash?')) clearCart()
      }
      setBuffer('')
      refocusScan()
      return
    }
    if (e.key === 'F1') {
      e.preventDefault()
      setPayMode('CASH')
      return
    }
    if (e.key === 'F2') {
      e.preventDefault()
      setPayMode('CARD')
      return
    }
    if (e.key === 'F3') {
      e.preventDefault()
      setPayMode('DEBT')
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

  const grand = sumGrand(cart)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900">
        <span className="font-semibold">Geeks POS</span>
        <div className="flex gap-2 items-center">
          {lastSaleId && (
            <button
              type="button"
              className="text-sm px-2 py-1 rounded bg-slate-800 border border-slate-600"
              onClick={() => lastSaleId && void tryPrint(lastSaleId)}
            >
              Qayta chek
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
            Chiqish
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
              refocusScan()
            }}
          >
            Yopish
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
          <label className="text-xs text-slate-400">Shtrix-kod (fokus doim bu yerda)</label>
          <input
            ref={scanRef}
            id="posScanInput"
            value={buffer}
            onChange={onScanChange}
            onKeyDown={onScanKeyDown}
            className={`w-full text-lg px-3 py-3 rounded border bg-slate-900 outline-none ${
              scanFlash ? 'border-red-500 ring-2 ring-red-600' : 'border-slate-600'
            }`}
            placeholder="Skaner..."
            autoComplete="off"
          />
          <p className="text-xs text-slate-500">
            Enter: skaner yoki savdo | ESC: savat (Shift+ESC tez tozalash) | F1 naqd F2 karta F3
            nasiya
          </p>

          <div className="rounded border border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="text-left p-2">Tovar</th>
                  <th className="p-2">Qty</th>
                  <th className="text-right p-2">Summa</th>
                </tr>
              </thead>
              <tbody>
                {cart.map((l) => (
                  <tr key={l.variantId} className="border-t border-slate-800">
                    <td className="p-2">
                      <div className="font-medium">{l.name}</div>
                      <div className="text-xs text-slate-400">
                        {l.colorLabel} / {l.sizeLabel} — {l.barcode}
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
                      Savat bo‘sh
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="w-full md:w-80 flex flex-col gap-3">
          <div className="rounded border border-slate-800 p-3 bg-slate-900">
            <div className="text-sm text-slate-400 mb-2">To‘lov rejimi</div>
            <div className="flex gap-2 flex-wrap">
              {(['CASH', 'CARD', 'DEBT'] as PayMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPayMode(m)}
                  className={`px-3 py-2 rounded text-sm border ${
                    payMode === m
                      ? 'bg-emerald-700 border-emerald-500'
                      : 'bg-slate-800 border-slate-600'
                  }`}
                >
                  {m === 'CASH' && 'F1 Naqd'}
                  {m === 'CARD' && 'F2 Karta'}
                  {m === 'DEBT' && 'F3 Nasiya'}
                </button>
              ))}
            </div>
          </div>

          {payMode === 'DEBT' && (
            <div className="rounded border border-slate-800 p-3 bg-slate-900 space-y-2">
              <div className="text-sm text-slate-400">Mijoz</div>
              <input
                className="w-full px-2 py-2 rounded bg-slate-950 border border-slate-700 text-sm"
                placeholder="Ism"
                value={customerName}
                onChange={(e) => setCustomer(e.target.value, customerPhone)}
              />
              <input
                className="w-full px-2 py-2 rounded bg-slate-950 border border-slate-700 text-sm"
                placeholder="Telefon (998...)"
                value={customerPhone}
                onChange={(e) => setCustomer(customerName, e.target.value)}
              />
            </div>
          )}

          <div className="rounded border border-slate-800 p-4 bg-slate-900">
            <div className="text-slate-400 text-sm">Jami</div>
            <div className="text-3xl font-bold mt-1">{grand}</div>
            <button
              type="button"
              disabled={completing || cart.length === 0}
              className="mt-4 w-full py-3 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 font-semibold"
              onClick={() => void doComplete()}
            >
              {completing ? 'Saqlanmoqda...' : 'Savdoni yakunlash (Enter)'}
            </button>
          </div>
        </aside>
      </main>
    </div>
  )
}
