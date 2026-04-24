import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Calculator, LogOut, ScanLine, Printer, LayoutGrid, Lock } from 'lucide-react'
import Decimal from 'decimal.js'
import {
  completeSale,
  fetchReceiptEscpos,
  fetchReceiptPlain,
  fetchHardwareConfig,
  fetchVariantByBarcode,
  fetchPosVariantSearch,
  fetchPosVariantsByProduct,
  fetchStockEvents,
  fetchMe,
  loginWithPin,
  logout,
  updatePosVariantPrice,
  type PosVariant,
} from '../api'
import { usePosStore, type PayMode } from '../store/posStore'
import { formatMoney } from '../utils/money'
import { printEscposBase64 } from '../utils/tauriPrint'
import { TouchNumpad } from '../components/TouchNumpad'

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

function beepOk() {
  try {
    const ctx = new AudioContext()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g)
    g.connect(ctx.destination)
    o.frequency.value = 880
    g.gain.value = 0.04
    o.start()
    setTimeout(() => {
      o.stop()
      ctx.close()
    }, 80)
  } catch {
    // ignore
  }
}

function normalizeScannerToken(token: string): string {
  const v = (token || '').trim()
  if (!v) return ''
  if (v === '\\t' || v.toLowerCase() === 'tab') return '\t'
  if (v === '\\n' || v.toLowerCase() === 'enter') return '\n'
  return token
}

function normalizeScanValue(raw: string, prefix: string, suffix: string): string {
  let value = (raw || '').trim()
  if (!value) return ''
  if (suffix && value.endsWith(suffix)) value = value.slice(0, -suffix.length).trim()
  if (prefix && value.startsWith(prefix)) value = value.slice(prefix.length)
  return value.trim()
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

function calcGrand(subtotal: Decimal, discount: Decimal): Decimal {
  const g = subtotal.minus(discount)
  return g.greaterThan(0) ? roundSom(g) : new Decimal(0)
}

const AFTER_SCAN_FOCUS_KEY = 'pos_after_scan_focus'
const LOW_STOCK_THRESHOLD = 5

type NumpadCtx = { kind: 'discount' } | { kind: 'payment'; rowId: string }

type StockMatrixOpen = { productId: string; colorId: string; title: string }

export function PosPage({
  onLogout,
  footerLangStrip = false,
}: {
  onLogout: () => void
  /** Standalone `/pos` (no admin sidebar): show language at bottom */
  footerLangStrip?: boolean
}) {
  const { t, i18n } = useTranslation()
  const scanRef = useRef<HTMLInputElement>(null)
  const lastQtyCellRef = useRef<HTMLDivElement>(null)
  const pendingQtyFocus = useRef(false)
  const [buffer, setBuffer] = useState('')
  const [toast, setToast] = useState<{ kind: 'err' | 'ok'; msg: string } | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [scanFlash, setScanFlash] = useState(false)
  const [cartFlash, setCartFlash] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [printBanner, setPrintBanner] = useState<string | null>(null)
  const [lastSaleId, setLastSaleId] = useState<string | null>(null)
  const [clearArmed, setClearArmed] = useState(false)
  const [orderDiscount, setOrderDiscount] = useState('0')
  const [debtDueDate, setDebtDueDate] = useState('')
  const [scannerPrefix, setScannerPrefix] = useState('')
  const [scannerSuffix, setScannerSuffix] = useState('\t')
  const [scannerMode, setScannerMode] = useState<'keyboard' | 'serial'>('keyboard')
  const [autoPrintOnSale, setAutoPrintOnSale] = useState(true)
  const [receiptPrinterName, setReceiptPrinterName] = useState('')
  const [afterScanFocus, setAfterScanFocus] = useState<'scan' | 'qty'>(() => {
    try {
      const v = localStorage.getItem(AFTER_SCAN_FOCUS_KEY)
      return v === 'qty' ? 'qty' : 'scan'
    } catch {
      return 'scan'
    }
  })
  const [numpadCtx, setNumpadCtx] = useState<NumpadCtx | null>(null)
  const [numpadBuf, setNumpadBuf] = useState('0')
  const [selectedLine, setSelectedLine] = useState<null | { variantId: string; name: string; stockQty: number; listPrice: string }>(null)
  const [numpadValue, setNumpadValue] = useState('0')
  const [priceBusy, setPriceBusy] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [searchResults, setSearchResults] = useState<PosVariant[]>([])
  const [searchBusy, setSearchBusy] = useState(false)
  const [stockMatrix, setStockMatrix] = useState<null | StockMatrixOpen>(null)
  const [locked, setLocked] = useState(false)
  const [lockTimeoutMinutes, setLockTimeoutMinutes] = useState(5)
  const [unlockPin, setUnlockPin] = useState('')
  const [unlockErr, setUnlockErr] = useState<string | null>(null)
  const [meUser, setMeUser] = useState('')
  const [matrixRows, setMatrixRows] = useState<PosVariant[]>([])
  const [matrixBusy, setMatrixBusy] = useState(false)

  const cart = usePosStore((s) => s.cart)
  const payMode = usePosStore((s) => s.payMode)
  const customerName = usePosStore((s) => s.customerName)
  const customerPhone = usePosStore((s) => s.customerPhone)
  const addLine = usePosStore((s) => s.addLine)
  const incQty = usePosStore((s) => s.incQty)
  const clearCart = usePosStore((s) => s.clearCart)
  const setPayMode = usePosStore((s) => s.setPayMode)
  const setCustomer = usePosStore((s) => s.setCustomer)
  const updateLinePrice = usePosStore((s) => s.updateLinePrice)
  const updateLineStock = usePosStore((s) => s.updateLineStock)

  const subtotal = sumGrand(cart)
  const subtotalDec = useMemo(() => parseSom(subtotal), [subtotal])
  const discountDec = useMemo(() => parseSom(orderDiscount), [orderDiscount])
  const grandDec = useMemo(() => calcGrand(subtotalDec, discountDec), [subtotalDec, discountDec])
  const grand = grandDec.toString()

  const lowStockLines = useMemo(() => {
    return cart.filter((l) => {
      const stock = Number(l.stockQty ?? 0)
      const remaining = stock - l.qty
      return remaining >= 0 && remaining <= LOW_STOCK_THRESHOLD
    })
  }, [cart])

  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([
    { id: crypto.randomUUID(), method: 'CASH', amount: '0' },
  ])
  const [activePayId, setActivePayId] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const me = await fetchMe()
        setMeUser(me.username)
      } catch {
        setMeUser('')
      }
    })()
  }, [])

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
  }, [safeRefocus, toast, banner, completing, printBanner])

  useEffect(() => {
    if (!pendingQtyFocus.current || cart.length === 0) return
    pendingQtyFocus.current = false
    const id = requestAnimationFrame(() => lastQtyCellRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [cart])

  useEffect(() => {
    const q = productSearch.trim()
    if (q.length < 2) {
      setSearchResults([])
      return
    }
    const tmr = window.setTimeout(() => {
      setSearchBusy(true)
      void fetchPosVariantSearch(q)
        .then(setSearchResults)
        .catch(() => {
          setSearchResults([])
          showToast('err', t('err.API_ERROR'))
        })
        .finally(() => setSearchBusy(false))
    }, 320)
    return () => window.clearTimeout(tmr)
  }, [productSearch, t])

  useEffect(() => {
    if (!stockMatrix) {
      setMatrixRows([])
      return
    }
    setMatrixBusy(true)
    void fetchPosVariantsByProduct(stockMatrix.productId, stockMatrix.colorId)
      .then(setMatrixRows)
      .catch(() => {
        setMatrixRows([])
        showToast('err', t('err.API_ERROR'))
      })
      .finally(() => setMatrixBusy(false))
  }, [stockMatrix, t])

  useEffect(() => {
    ;(async () => {
      try {
        const cfg = await fetchHardwareConfig()
        setScannerMode(cfg.scanner_mode === 'serial' ? 'serial' : 'keyboard')
        setScannerPrefix(normalizeScannerToken(cfg.scanner_prefix || ''))
        setScannerSuffix(normalizeScannerToken(cfg.scanner_suffix || '\t') || '\t')
        setAutoPrintOnSale(cfg.auto_print_on_sale !== false)
        setReceiptPrinterName((cfg.receipt_printer_name || '').trim())
        setLockTimeoutMinutes(Math.max(1, Number(cfg.lock_timeout_minutes || 5)))
      } catch {
        setScannerPrefix('')
        setScannerSuffix('\t')
        setScannerMode('keyboard')
        setAutoPrintOnSale(true)
        setReceiptPrinterName('')
        setLockTimeoutMinutes(5)
      }
    })()
  }, [])

  useEffect(() => {
    if (locked) return
    const timeoutMs = Math.max(1, lockTimeoutMinutes) * 60 * 1000
    let timer = window.setTimeout(() => setLocked(true), timeoutMs)
    const reset = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setLocked(true), timeoutMs)
    }
    const events: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'touchstart']
    for (const e of events) window.addEventListener(e, reset, { passive: true })
    return () => {
      window.clearTimeout(timer)
      for (const e of events) window.removeEventListener(e, reset as EventListener)
    }
  }, [locked, lockTimeoutMinutes])

  useEffect(() => {
    let since: string | undefined
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const events = await fetchStockEvents(since)
          if (events.length === 0) return
          since = events[events.length - 1].created_at
          for (const e of events) {
            updateLineStock(e.variant_id, e.stock_qty)
          }
        } catch {
          // ignore stock sync polling errors
        }
      })()
    }, 5000)
    return () => window.clearInterval(id)
  }, [updateLineStock])

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
        await printEscposBase64(b64, receiptPrinterName || null)
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

  function addVariantToCart(v: PosVariant, opts?: { clearSearch?: boolean }) {
    addLine({
      variantId: v.id,
      productId: v.product,
      colorId: v.color,
      barcode: v.barcode ?? '',
      name: v.product_name_uz,
      sizeLabel: v.size_label_uz,
      colorLabel: v.color_label_uz,
      listPrice: String(v.list_price),
      stockQty: Number(v.stock_qty || 0),
      qty: 1,
    })
    beepOk()
    setCartFlash(true)
    setTimeout(() => setCartFlash(false), 240)
    if (opts?.clearSearch) {
      setProductSearch('')
      setSearchResults([])
    }
    if (afterScanFocus === 'qty') {
      pendingQtyFocus.current = true
    } else {
      safeRefocus()
    }
  }

  async function handleScanSubmit(code: string) {
    const c = code.trim()
    if (!c) return
    try {
      const v = await fetchVariantByBarcode(c)
      setBuffer('')
      addVariantToCart(v)
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
      setBanner(`${t('msg.paymentMismatch')} (${formatMoney(payTotal.toString())} / ${formatMoney(grandDec.toString())})`)
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
          order_discount: discountDec.toString(),
          customer,
          debt_due_date: hasDebt && debtDueDate ? debtDueDate : null,
          expected_grand_total: grandDec.toString(),
        },
        idem,
      )
      setLastSaleId(res.sale_id)
      clearCart()
      setPaymentRows([{ id: crypto.randomUUID(), method: 'CASH', amount: '0' }])
      setActivePayId(null)
      setOrderDiscount('0')
      setDebtDueDate('')
      showToast('ok', `${t('msg.sale')}: ${res.public_sale_no || res.sale_id}`)
      setTimeout(() => setCompleting(false), 400)
      if (autoPrintOnSale) void tryPrint(res.sale_id as string)
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
        const normalized = normalizeScanValue(buffer, scannerPrefix, scannerSuffix || '\t')
        setBuffer('')
        if (normalized) void handleScanSubmit(normalized)
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
    if (scannerMode !== 'keyboard') {
      setBuffer(v)
      return
    }
    const suffix = scannerSuffix || '\t'
    if (suffix && v.endsWith(suffix)) {
      const code = normalizeScanValue(v, scannerPrefix, suffix)
      setBuffer('')
      void handleScanSubmit(code)
      return
    }
    setBuffer(v)
  }

  const payTotalView = paymentTotal().toString()

  function openAmountNumpad(ctx: NumpadCtx) {
    setNumpadCtx(ctx)
    if (ctx.kind === 'discount') {
      setNumpadBuf(roundSom(parseSom(orderDiscount)).toString())
    } else {
      const row = paymentRows.find((r) => r.id === ctx.rowId)
      setNumpadBuf(row ? roundSom(parseSom(row.amount)).toString() : '0')
    }
  }

  function applyAmountNumpad() {
    if (!numpadCtx) return
    const v = roundSom(parseSom(numpadBuf)).toString()
    if (numpadCtx.kind === 'discount') {
      setOrderDiscount(v)
    } else {
      updatePaymentRow(numpadCtx.rowId, { amount: v })
    }
    setNumpadCtx(null)
    safeRefocus()
  }

  function setAfterScanMode(mode: 'scan' | 'qty') {
    setAfterScanFocus(mode)
    try {
      localStorage.setItem(AFTER_SCAN_FOCUS_KEY, mode)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold truncate">{t('app.title')}</span>
        </div>
        <div className="flex gap-2 items-center">
          {lastSaleId && (
            <button
              type="button"
              className="touch-btn inline-flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-slate-800 border border-slate-600"
              onClick={() => lastSaleId && void tryPrint(lastSaleId)}
            >
              <Printer className="h-4 w-4" aria-hidden />
              {t('header.reprint')}
            </button>
          )}
          <button
            type="button"
            className="touch-btn inline-flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-slate-800 border border-slate-600 text-slate-200"
            onClick={() => {
              setLocked(true)
              setUnlockPin('')
              setUnlockErr(null)
            }}
          >
            <Lock className="h-4 w-4" aria-hidden />
            {t('header.lock', { defaultValue: 'Lock' })}
          </button>
          <button
            type="button"
            className="touch-btn inline-flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-slate-800 border border-slate-600 text-slate-200"
            onClick={async () => {
              await logout()
              onLogout()
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden />
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
      {lowStockLines.length > 0 && (
        <div className="mx-4 mt-2 px-3 py-2 rounded text-sm bg-amber-950/90 border border-amber-700 text-amber-50">
          <div className="font-medium">{t('pos.lowStockWarning', { n: LOW_STOCK_THRESHOLD })}</div>
          <ul className="mt-1 list-disc list-inside text-xs opacity-95">
            {lowStockLines.map((l) => (
              <li key={l.variantId}>
                {l.name} — {l.colorLabel} / {l.sizeLabel}:{' '}
                {t('pos.afterSaleStock', { count: Math.max(0, Number(l.stockQty ?? 0) - l.qty) })}
              </li>
            ))}
          </ul>
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

          <label className="text-xs text-slate-400 mt-3 block" htmlFor="posProductSearch">
            {t('pos.searchLabel')}
          </label>
          <input
            id="posProductSearch"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            className="touch-btn w-full text-base px-3 py-3 rounded-xl border bg-slate-900 border-slate-600 outline-none"
            placeholder={t('pos.searchPlaceholder')}
            autoComplete="off"
          />
          {searchBusy && <p className="text-xs text-slate-500">{t('admin.common.loading')}</p>}
          {productSearch.trim().length >= 2 && !searchBusy && searchResults.length === 0 && (
            <p className="text-xs text-amber-600/90">{t('pos.searchEmpty')}</p>
          )}
          {searchResults.length > 0 && (
            <ul
              className="max-h-52 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/90 divide-y divide-slate-800"
              role="listbox"
            >
              {searchResults.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    className="touch-btn w-full min-h-12 text-left px-3 py-3 text-sm hover:bg-slate-800"
                    onClick={() => addVariantToCart(v, { clearSearch: true })}
                  >
                    <div className="font-medium">{v.product_name_uz}</div>
                    <div className="text-xs text-slate-400">
                      {v.color_label_uz} / {v.size_label_uz} · {formatMoney(String(v.list_price))} ·{' '}
                      {t('admin.catalog.stock')}: {v.stock_qty}
                    </div>
                    {v.barcode ? <div className="text-xs text-slate-500 font-mono mt-0.5">{v.barcode}</div> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>{t('pos.focusAfterScan')}:</span>
            <button
              type="button"
              className={`touch-btn px-3 py-2 rounded-lg border text-sm ${
                afterScanFocus === 'scan' ? 'border-emerald-500 bg-emerald-950/50 text-emerald-100' : 'border-slate-600'
              }`}
              onClick={() => setAfterScanMode('scan')}
            >
              {t('pos.focusScanField')}
            </button>
            <button
              type="button"
              className={`touch-btn px-3 py-2 rounded-lg border text-sm ${
                afterScanFocus === 'qty' ? 'border-emerald-500 bg-emerald-950/50 text-emerald-100' : 'border-slate-600'
              }`}
              onClick={() => setAfterScanMode('qty')}
            >
              {t('pos.focusQtyField')}
            </button>
          </div>

          {cart.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 py-12 px-6 text-center">
              <ScanLine className="mx-auto h-20 w-20 text-slate-600 mb-4" strokeWidth={1.25} aria-hidden />
              <div className="text-lg font-semibold text-slate-200">{t('pos.emptyCartTitle')}</div>
              <p className="text-sm text-slate-400 mt-2 max-w-sm mx-auto">{t('pos.emptyCartBody')}</p>
            </div>
          )}

          <div
            className={`rounded-xl border overflow-hidden transition-colors ${
              cart.length === 0 ? 'hidden' : ''
            } ${cartFlash ? 'border-emerald-500' : 'border-slate-800'}`}
          >
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="text-left p-3">{t('cart.title')}</th>
                  <th className="p-3">{t('cart.qty')}</th>
                  <th className="text-right p-3">{t('cart.sum')}</th>
                </tr>
              </thead>
              <tbody>
                {cart.map((l, idx) => (
                  <tr
                    key={l.variantId}
                    className="border-t border-slate-800 cursor-pointer hover:bg-slate-900/60"
                    onClick={() => {
                      setNumpadValue(String(parseSom(l.listPrice)))
                      setSelectedLine({
                        variantId: l.variantId,
                        name: l.name,
                        stockQty: Number(l.stockQty || 0),
                        listPrice: l.listPrice,
                      })
                    }}
                  >
                    <td className="p-3">
                      <div className="font-medium">{l.name}</div>
                      <div className="text-xs text-slate-400">
                        {l.colorLabel} / {l.sizeLabel} - {l.barcode}
                      </div>
                      {l.productId ? (
                        <button
                          type="button"
                          className="touch-btn mt-2 inline-flex items-center gap-2 text-xs px-3 py-2 rounded-xl bg-slate-800 border border-slate-600 text-slate-200"
                          onClick={(e) => {
                            e.stopPropagation()
                            setStockMatrix({
                              productId: l.productId,
                              colorId: l.colorId,
                              title: `${l.name} — ${l.colorLabel}`,
                            })
                          }}
                        >
                          <LayoutGrid className="h-4 w-4 shrink-0" aria-hidden />
                          {t('pos.stockMatrix')}
                        </button>
                      ) : null}
                    </td>
                    <td className="p-3 text-center">
                      <div
                        ref={idx === cart.length - 1 ? lastQtyCellRef : undefined}
                        tabIndex={idx === cart.length - 1 ? 0 : -1}
                        className="inline-flex items-center gap-2 outline-none rounded-lg focus-visible:ring-2 focus-visible:ring-emerald-500"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="touch-btn min-h-12 min-w-12 rounded-xl bg-slate-800 border border-slate-600 text-lg font-semibold"
                          onClick={() => incQty(l.variantId, -1)}
                        >
                          -
                        </button>
                        <span className="min-w-[2rem] text-center text-base font-medium">{l.qty}</span>
                        <button
                          type="button"
                          className="touch-btn min-h-12 min-w-12 rounded-xl bg-slate-800 border border-slate-600 text-lg font-semibold"
                          onClick={() => incQty(l.variantId, 1)}
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="p-3 text-right text-base">{formatMoney(moneyFromLine(l.listPrice, l.qty))}</td>
                  </tr>
                ))}
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
                className="touch-btn px-4 py-2 text-sm rounded-xl bg-slate-800 border border-slate-600"
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
                    className="touch-btn min-h-12 px-2 rounded-xl bg-slate-900 border border-slate-600 text-sm"
                    value={r.method}
                    onChange={(e) => updatePaymentRow(r.id, { method: e.target.value as PayMode })}
                  >
                    <option value="CASH">{t('pay.method.cash')}</option>
                    <option value="CARD">{t('pay.method.card')}</option>
                    <option value="DEBT">{t('pay.method.debt')}</option>
                  </select>
                  <div className="flex gap-1 items-stretch min-w-0">
                    <input
                      className="touch-btn min-h-12 flex-1 min-w-0 px-2 rounded-xl bg-slate-900 border border-slate-600 text-sm"
                      value={r.amount}
                      onChange={(e) => updatePaymentRow(r.id, { amount: e.target.value })}
                    />
                    <button
                      type="button"
                      className="touch-btn min-h-12 min-w-12 shrink-0 rounded-xl bg-slate-800 border border-slate-600 flex items-center justify-center"
                      onClick={() => openAmountNumpad({ kind: 'payment', rowId: r.id })}
                      aria-label={t('pos.openNumpad')}
                    >
                      <Calculator className="h-5 w-5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="touch-btn min-h-12 min-w-12 rounded-xl bg-slate-800 border border-slate-600 text-sm font-bold"
                    onClick={() => removePaymentRow(r.id)}
                    disabled={paymentRows.length === 1}
                    title={`${t('pay.addRow')} #${idx + 1}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-2 text-xs text-slate-400">
              {t('summary.subtotal')}: {formatMoney(subtotal)}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {t('summary.discount')}: {formatMoney(orderDiscount)}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {t('pay.total')}: {formatMoney(payTotalView)} / {t('pay.grand')}: {formatMoney(grand)}
            </div>
            <div className="mt-2 flex gap-2 items-stretch">
              <input
                className="touch-btn min-h-12 flex-1 px-3 rounded-xl bg-slate-900 border border-slate-600 text-sm"
                value={orderDiscount}
                onChange={(e) => setOrderDiscount(e.target.value)}
                placeholder={t('summary.discount')}
              />
              <button
                type="button"
                className="touch-btn min-h-12 min-w-12 shrink-0 rounded-xl bg-slate-800 border border-slate-600 flex items-center justify-center"
                onClick={() => openAmountNumpad({ kind: 'discount' })}
                aria-label={t('pos.openNumpad')}
              >
                <Calculator className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 flex gap-3 flex-wrap">
              {(['CASH', 'CARD', 'DEBT'] as PayMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setActiveMethod(m)}
                  className={`touch-btn min-h-12 px-5 rounded-xl text-sm font-medium border ${
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
                className="touch-btn w-full min-h-12 px-3 rounded-xl bg-slate-950 border border-slate-700 text-sm"
                placeholder={t('pay.customerName')}
                value={customerName}
                onChange={(e) => setCustomer(e.target.value, customerPhone)}
              />
              <input
                className="touch-btn w-full min-h-12 px-3 rounded-xl bg-slate-950 border border-slate-700 text-sm"
                placeholder={t('pay.customerPhone')}
                value={customerPhone}
                onChange={(e) => setCustomer(customerName, e.target.value)}
              />
              <input
                type="date"
                className="touch-btn w-full min-h-12 px-3 rounded-xl bg-slate-950 border border-slate-700 text-sm"
                value={debtDueDate}
                onChange={(e) => setDebtDueDate(e.target.value)}
              />
            </div>
          )}

          <div className="rounded-xl border border-slate-800 p-4 bg-slate-900">
            <div className="text-slate-400 text-sm">{t('summary.total')}</div>
            <div className="text-3xl font-bold mt-1">{formatMoney(grand)}</div>
            <button
              type="button"
              disabled={completing || cart.length === 0}
              className="touch-btn mt-4 w-full min-h-14 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 font-semibold text-lg"
              onClick={() => void doComplete()}
            >
              {completing ? t('summary.saving') : t('summary.completeTouch')}
            </button>
            <p className="text-xs text-slate-500 mt-2 text-center">{t('summary.complete')}</p>
          </div>
        </aside>
      </main>
      {numpadCtx && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 pt-10">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl">
            <h3 className="text-lg font-semibold mb-1">
              {numpadCtx.kind === 'discount' ? t('pos.numpadDiscountTitle') : t('pos.numpadTitle')}
            </h3>
            <div className="text-3xl font-bold mb-4 text-center">{formatMoney(numpadBuf)}</div>
            <TouchNumpad value={(numpadBuf || '0').replace(/\D/g, '') || '0'} onChange={setNumpadBuf} />
            <div className="flex gap-3 mt-5 justify-end">
              <button
                type="button"
                className="touch-btn min-h-12 px-5 rounded-xl bg-slate-800 border border-slate-600"
                onClick={() => {
                  setNumpadCtx(null)
                  safeRefocus()
                }}
              >
                {t('admin.common.cancel')}
              </button>
              <button
                type="button"
                className="touch-btn min-h-12 px-6 rounded-xl bg-emerald-700 border border-emerald-500 font-semibold"
                onClick={() => applyAmountNumpad()}
              >
                {t('pos.numpadApply')}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedLine && (
        <div className="fixed inset-0 z-30 bg-black/60 flex items-start justify-center p-4 pt-10">
          <div className="w-full max-w-lg rounded border border-slate-700 bg-slate-900 p-4 space-y-3">
            <h3 className="text-lg font-semibold">{selectedLine.name}</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded bg-slate-950 border border-slate-700 p-2">
                <div className="text-slate-400">{t('admin.catalog.stock')}</div>
                <div className="text-xl">{selectedLine.stockQty}</div>
              </div>
              <div className="rounded bg-slate-950 border border-slate-700 p-2">
                <div className="text-slate-400">{t('admin.catalog.salePrice')}</div>
                <div className="text-xl">{formatMoney(selectedLine.listPrice)}</div>
              </div>
            </div>
            <div className="rounded-xl bg-slate-950 border border-slate-700 p-3">
              <div className="text-sm text-slate-400 mb-2">{t('admin.catalog.salePrice')}</div>
              <div className="text-3xl font-semibold mb-3">{formatMoney(numpadValue)}</div>
              <TouchNumpad
                value={(numpadValue || '0').replace(/\D/g, '') || '0'}
                onChange={(v) => setNumpadValue(v)}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="touch-btn min-h-12 px-5 rounded-xl bg-slate-800 border border-slate-600"
                onClick={() => {
                  setSelectedLine(null)
                  safeRefocus()
                }}
              >
                {t('admin.common.cancel')}
              </button>
              <button
                type="button"
                disabled={priceBusy}
                className="touch-btn min-h-12 px-5 rounded-xl bg-emerald-700 border border-emerald-500 disabled:opacity-50"
                onClick={async () => {
                  setPriceBusy(true)
                  try {
                    const nextPrice = String(parseSom(numpadValue))
                    await updatePosVariantPrice(selectedLine.variantId, nextPrice)
                    updateLinePrice(selectedLine.variantId, nextPrice)
                    showToast('ok', t('admin.settings.actionCompleted', { label: t('admin.catalog.salePrice') }))
                    setSelectedLine(null)
                    setNumpadValue('0')
                  } catch (e: unknown) {
                    const code = (e as Error & { code?: string }).code
                    showToast('err', t(`err.${code || 'POS_PRICE_UPDATE_FAILED'}`))
                  } finally {
                    setPriceBusy(false)
                  }
                }}
              >
                {priceBusy ? t('admin.common.saving') : t('admin.common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
      {stockMatrix && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-10"
          role="dialog"
          aria-modal
          aria-labelledby="stock-matrix-title"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <h2 id="stock-matrix-title" className="text-lg font-semibold text-slate-100">
                  {t('pos.stockMatrixTitle')}
                </h2>
                <p className="text-sm text-slate-400 mt-1">{stockMatrix.title}</p>
              </div>
              <button
                type="button"
                className="touch-btn px-4 py-2 rounded-xl bg-slate-800 border border-slate-600 text-sm"
                onClick={() => {
                  setStockMatrix(null)
                  safeRefocus()
                }}
              >
                {t('pos.matrixClose')}
              </button>
            </div>
            {matrixBusy ? (
              <p className="text-sm text-slate-400 py-6">{t('admin.common.loading')}</p>
            ) : (
              <div className="overflow-y-auto rounded-xl border border-slate-800">
                <table className="w-full text-sm">
                  <thead className="bg-slate-950 text-slate-400 sticky top-0">
                    <tr>
                      <th className="text-left p-3">{t('pos.matrixSize')}</th>
                      <th className="text-right p-3">{t('pos.matrixStock')}</th>
                      <th className="text-right p-3">{t('cart.sum')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrixRows.map((r) => (
                      <tr key={r.id} className="border-t border-slate-800">
                        <td className="p-3">
                          <div className="font-medium">{r.size_label_uz}</div>
                          {r.barcode ? <div className="text-xs text-slate-500 font-mono">{r.barcode}</div> : null}
                        </td>
                        <td className="p-3 text-right tabular-nums">{r.stock_qty}</td>
                        <td className="p-3 text-right tabular-nums">{formatMoney(String(r.list_price))}</td>
                      </tr>
                    ))}
                    {matrixRows.length === 0 && (
                      <tr>
                        <td colSpan={3} className="p-6 text-center text-slate-500">
                          {t('pos.searchEmpty')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {footerLangStrip && (
        <footer className="border-t border-slate-800 bg-slate-900 px-4 py-2 flex flex-wrap items-center gap-2 justify-center shrink-0">
          <span className="text-xs text-slate-500 uppercase tracking-wide">{t('admin.sidebar.language')}</span>
          <button
            type="button"
            className={`touch-btn text-sm px-4 py-2 rounded-xl border ${
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
            className={`touch-btn text-sm px-4 py-2 rounded-xl border ${
              i18n.language.startsWith('ru')
                ? 'bg-emerald-700 border-emerald-500 text-white'
                : 'bg-slate-800 border-slate-600 text-slate-200'
            }`}
            onClick={() => i18n.changeLanguage('ru')}
          >
            {t('lang.ru')}
          </button>
        </footer>
      )}
      {locked && (
        <div className="fixed inset-0 z-[90] bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
            <h3 className="text-lg font-semibold">{t('header.lock', { defaultValue: 'Locked' })}</h3>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-700"
              value={unlockPin}
              onChange={(e) => setUnlockPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder={t('auth.pinPlaceholder', { defaultValue: '1234' })}
            />
            {unlockErr && <p className="text-sm text-red-400">{unlockErr}</p>}
            <button
              type="button"
              className="w-full px-3 py-2 rounded bg-emerald-700 border border-emerald-500"
              onClick={async () => {
                try {
                  if (!meUser) throw new Error('INVALID_PIN')
                  await loginWithPin(meUser, unlockPin)
                  setLocked(false)
                } catch {
                  setUnlockErr(t('err.INVALID_PIN'))
                }
              }}
            >
              {t('admin.common.unlock', { defaultValue: 'Unlock' })}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
