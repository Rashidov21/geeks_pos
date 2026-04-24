import type { ReactNode } from 'react'

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '0', 'Del'] as const

type Props = {
  /** Raw digit string (e.g. money integer as string) */
  value: string
  onChange: (next: string) => void
  /** Optional label above keys */
  label?: ReactNode
  className?: string
}

/** Large on-screen keypad for touch POS (digits + clear + backspace). */
export function TouchNumpad({ value, onChange, label, className = '' }: Props) {
  function press(k: (typeof KEYS)[number]) {
    if (k === 'C') {
      onChange('0')
      return
    }
    if (k === 'Del') {
      const next = value.slice(0, -1)
      onChange(next.length ? next : '0')
      return
    }
    onChange(value === '0' ? k : `${value}${k}`)
  }

  return (
    <div className={className}>
      {label != null && <div className="text-sm text-slate-400 mb-2">{label}</div>}
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className="touch-btn min-h-14 py-4 rounded-xl bg-slate-800 border border-slate-600 text-xl font-medium text-slate-100 active:brightness-95"
            onClick={() => press(k)}
          >
            {k === 'Del' ? '⌫' : k}
          </button>
        ))}
      </div>
    </div>
  )
}
