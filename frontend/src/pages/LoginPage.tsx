import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchPinUsers, loginWithPin } from '../api'

export function LoginPage({ onDone }: { onDone: () => void }) {
  const { t, i18n } = useTranslation()
  const [users, setUsers] = useState<Array<{ username: string; display_name: string; role: string; pin_enabled: boolean }>>([])
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const rows = await fetchPinUsers()
        setUsers(rows)
        setU(rows[0]?.username || '')
      } catch {
        setUsers([])
      }
    })()
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      await loginWithPin(u, p)
      onDone()
    } catch (ex: unknown) {
      const code = (ex as Error & { code?: string }).code
      setErr(t(`err.${code || 'INVALID_CREDENTIALS'}`, { defaultValue: t('msg.errorGeneric') }))
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
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className={`touch-btn text-sm px-4 py-2 rounded-xl border ${
              i18n.language.startsWith('uz')
                ? 'bg-emerald-700 border-emerald-500 text-white'
                : 'bg-slate-700 border-slate-600 text-slate-200'
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
                : 'bg-slate-700 border-slate-600 text-slate-200'
            }`}
            onClick={() => i18n.changeLanguage('ru')}
          >
            {t('lang.ru')}
          </button>
        </div>
        <h1 className="text-xl font-semibold text-center">{t('app.title')}</h1>
        <label className="block text-sm">
          {t('auth.userSelect', { defaultValue: t('auth.username') })}
          <select
            className="touch-btn mt-1 w-full min-h-14 rounded-xl bg-slate-950 border border-slate-600 px-4 py-3 text-base"
            value={u}
            onChange={(e) => setU(e.target.value)}
          >
            {users.map((row) => (
              <option key={row.username} value={row.username}>
                {row.display_name} ({row.role})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          {t('auth.pin', { defaultValue: 'PIN' })}
          <input
            type="password"
            maxLength={4}
            inputMode="numeric"
            className="touch-btn mt-1 w-full min-h-14 rounded-xl bg-slate-950 border border-slate-600 px-4 py-3 text-base"
            value={p}
            onChange={(e) => setP(e.target.value.replace(/\D/g, '').slice(0, 4))}
            autoComplete="current-password"
            placeholder={t('auth.pinPlaceholder', { defaultValue: '1234' })}
          />
        </label>
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button
          type="submit"
          disabled={busy}
          className="touch-btn w-full min-h-14 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-lg font-semibold"
        >
          {busy ? t('auth.logging') : t('auth.login')}
        </button>
        <p className="text-xs text-slate-400 text-center">{t('auth.pinHint', { defaultValue: '4 xonali PIN kiriting' })}</p>
      </form>
    </div>
  )
}
