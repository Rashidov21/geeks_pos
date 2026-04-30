import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { TouchNumpad } from './TouchNumpad'

type Props = {
  value: string | number
  onChange: (next: string) => void
  label?: ReactNode
  className?: string
  min?: number
  max?: number
  maxDigits?: number
}

function digitsOnly(v: string): string {
  return (v || '').replace(/\D/g, '')
}

const inputPreviewCls =
  'w-full min-h-12 px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-600 text-right text-lg font-semibold tabular-nums text-slate-100'

export function NumericNumpadField({ value, onChange, label, className = '', min, max, maxDigits }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [localValue, setLocalValue] = useState('0')
  /** Value committed in parent when modal was opened (for before/after). */
  const [baseline, setBaseline] = useState('0')

  const displayValue = useMemo(() => digitsOnly(String(value || '0')) || '0', [value])

  useEffect(() => {
    if (!open) setLocalValue(displayValue)
  }, [displayValue, open])

  function clamp(raw: string): string {
    let n = Math.max(0, Math.floor(Number(digitsOnly(raw) || '0')))
    if (Number.isFinite(min)) n = Math.max(Number(min), n)
    if (Number.isFinite(max)) n = Math.min(Number(max), n)
    return String(n)
  }

  function applyAndClose() {
    onChange(clamp(localValue))
    setOpen(false)
  }

  const previewRaw = digitsOnly(localValue) || '0'
  const previewApplied = clamp(localValue)

  return (
    <>
      <button
        type="button"
        className={`touch-btn w-full min-h-12 px-3 rounded-xl bg-slate-900 border border-slate-700 text-right tabular-nums ${className}`}
        onClick={() => {
          setBaseline(displayValue)
          setLocalValue(displayValue)
          setOpen(true)
        }}
      >
        {displayValue}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
        >
          <div
            className="my-auto w-full max-w-sm max-h-[min(90dvh,90svh)] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3 shadow-xl kiosk-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('common.valueBefore')}</div>
              <div className={inputPreviewCls} aria-readonly>
                {baseline}
              </div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('common.valueEditing')}</div>
              <div className={`${inputPreviewCls} border-emerald-700/50 ring-1 ring-emerald-500/30`} aria-live="polite">
                {previewRaw}
              </div>
              {previewRaw !== previewApplied && (
                <p className="text-center text-xs text-amber-200/90">{t('common.numpadWillSaveAs', { value: previewApplied })}</p>
              )}
            </div>
            <TouchNumpad
              className="rounded-xl border border-slate-800 bg-slate-950 p-3"
              value={digitsOnly(localValue) || '0'}
              onChange={setLocalValue}
              maxDigits={maxDigits}
              label={label}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="touch-btn min-h-12 px-4 rounded-xl bg-slate-800 border border-slate-600"
                onClick={() => setOpen(false)}
              >
                {t('admin.common.cancel')}
              </button>
              <button
                type="button"
                className="touch-btn min-h-12 px-5 rounded-xl bg-emerald-700 border border-emerald-500 font-medium"
                onClick={applyAndClose}
              >
                {t('admin.common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
