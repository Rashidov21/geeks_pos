import { listInstalledPrinters, printRawBase64 } from './tauriPrint'

type PrintKind = 'receipt' | 'label'

type DispatchOptions = {
  payloadBase64: string
  kind: PrintKind
  settings: PrinterSettingsLike | null
}

type PrinterSettingsLike = {
  receipt_printer_name?: string
  label_printer_name?: string
}

const RECEIPT_FALLBACK_MODEL = 'XP-80C'
const LABEL_FALLBACK_MODEL = 'XP-365B'

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function findByNameOrModel(printers: string[], expected: string): string | null {
  const needle = normalize(expected)
  if (!needle) return null
  const exact = printers.find((p) => normalize(p) === needle)
  if (exact) return exact
  const partial = printers.find((p) => normalize(p).includes(needle))
  return partial ?? null
}

function chooseConfiguredName(kind: PrintKind, settings: PrinterSettingsLike | null): string {
  if (kind === 'receipt') return (settings?.receipt_printer_name || '').trim()
  return (settings?.label_printer_name || '').trim()
}

function fallbackModel(kind: PrintKind): string {
  return kind === 'receipt' ? RECEIPT_FALLBACK_MODEL : LABEL_FALLBACK_MODEL
}

export async function dispatchPrint({ payloadBase64, kind, settings }: DispatchOptions): Promise<void> {
  const configured = chooseConfiguredName(kind, settings)
  const printers = await listInstalledPrinters()

  // If list is unavailable, keep old behavior: send to configured/default spooler.
  if (printers.length === 0) {
    await printRawBase64(payloadBase64, configured || null)
    return
  }

  const chosen =
    findByNameOrModel(printers, configured) || findByNameOrModel(printers, fallbackModel(kind))

  if (!chosen) {
    const missing = configured || fallbackModel(kind)
    throw new Error(`Printer ulanmagan: ${missing}`)
  }

  await printRawBase64(payloadBase64, chosen)
}

export async function dispatchReceipt(payloadBase64: string, settings: PrinterSettingsLike | null): Promise<void> {
  return dispatchPrint({ payloadBase64, kind: 'receipt', settings })
}

export async function dispatchLabel(payloadBase64: string, settings: PrinterSettingsLike | null): Promise<void> {
  return dispatchPrint({ payloadBase64, kind: 'label', settings })
}
