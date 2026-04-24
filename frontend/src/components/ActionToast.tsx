export function ActionToast({
  kind,
  message,
}: {
  kind: 'ok' | 'err' | 'info'
  message: string
}) {
  const cls =
    kind === 'ok'
      ? 'bg-emerald-950 border-emerald-700 text-emerald-100'
      : kind === 'err'
        ? 'bg-red-950 border-red-700 text-red-100'
        : 'bg-slate-900 border-slate-700 text-slate-100'
  return <div className={`px-3 py-2 rounded text-sm border ${cls}`}>{message}</div>
}
