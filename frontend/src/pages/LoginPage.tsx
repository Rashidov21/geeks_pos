import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchCsrf, login } from '../api'

export function LoginPage({ onDone }: { onDone: () => void }) {
  const { t, i18n } = useTranslation()
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
          {t('auth.username')}
          <input
            className="touch-btn mt-1 w-full min-h-14 rounded-xl bg-slate-950 border border-slate-600 px-4 py-3 text-base"
            value={u}
            onChange={(e) => setU(e.target.value)}
            autoComplete="username"
            placeholder={t('auth.usernamePlaceholder')}
          />
        </label>
        <label className="block text-sm">
          {t('auth.password')}
          <input
            type="password"
            className="touch-btn mt-1 w-full min-h-14 rounded-xl bg-slate-950 border border-slate-600 px-4 py-3 text-base"
            value={p}
            onChange={(e) => setP(e.target.value)}
            autoComplete="current-password"
            placeholder={t('auth.passwordPlaceholder')}
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
        <p className="text-xs text-slate-400 text-center">{t('auth.demo')}</p>
      </form>
    </div>
  )
}
