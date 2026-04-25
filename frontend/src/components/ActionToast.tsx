import { useEffect, useState } from 'react'

export function ActionToast({
  kind,
  message,
  durationMs = 4000,
  onClose,
}: {
  kind: 'ok' | 'err' | 'info'
  message: string
  durationMs?: number
  onClose?: () => void
}) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    setVisible(true)
    const timer = window.setTimeout(() => {
      setVisible(false)
      onClose?.()
    }, durationMs)
    return () => window.clearTimeout(timer)
  }, [durationMs, kind, message, onClose])

  if (!visible) return null

  const cls =
    kind === 'ok'
      ? 'bg-emerald-950/95 border-emerald-700 text-emerald-100'
      : kind === 'err'
        ? 'bg-red-950/95 border-red-700 text-red-100'
        : 'bg-slate-900/95 border-slate-700 text-slate-100'

  return (
    <div className="fixed top-4 right-4 z-[130] max-w-sm w-[calc(100vw-2rem)] pointer-events-none">
      <div className={`pointer-events-auto px-4 py-3 rounded-xl text-sm border shadow-2xl backdrop-blur ${cls}`}>
        {message}
      </div>
    </div>
  )
}
