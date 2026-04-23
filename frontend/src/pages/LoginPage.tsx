import { useState } from 'react'
import { fetchCsrf, login } from '../api'

export function LoginPage({ onDone }: { onDone: () => void }) {
  const [u, setU] = useState('cashier')
  const [p, setP] = useState('pass12345')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      await fetchCsrf()
      await login(u, p)
      onDone()
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : 'Login error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 bg-slate-800 p-6 rounded-xl border border-slate-700"
      >
        <h1 className="text-xl font-semibold text-center">Geeks POS</h1>
        <label className="block text-sm">
          Username
          <input
            className="mt-1 w-full rounded bg-slate-950 border border-slate-600 px-3 py-2"
            value={u}
            onChange={(e) => setU(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            type="password"
            className="mt-1 w-full rounded bg-slate-950 border border-slate-600 px-3 py-2"
            value={p}
            onChange={(e) => setP(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-medium"
        >
          {busy ? '...' : 'Kirish'}
        </button>
        <p className="text-xs text-slate-400 text-center">
          Demo: create user with `python manage.py createsuperuser` or use seeded cashier.
        </p>
      </form>
    </div>
  )
}
