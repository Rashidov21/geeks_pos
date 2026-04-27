import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import i18n, { loadLocale } from './i18n'

const RUNTIME_API_KEY = 'geeks_pos_runtime_api_base'

async function appendUiLog(level: 'INFO' | 'ERROR', message: string) {
  try {
    const { invoke } = await import('@tauri-apps/api/tauri')
    await invoke('append_app_log', { level, message })
  } catch {
    // ignore logging failures in web/dev mode
  }
}

window.addEventListener('error', (event) => {
  void appendUiLog('ERROR', `window.error: ${event.message || 'unknown'}`)
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason.stack || event.reason.message : String(event.reason)
  void appendUiLog('ERROR', `unhandledrejection: ${reason}`)
})

async function bootstrap() {
  const root = createRoot(document.getElementById('root')!)
  const splash = (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="mx-auto h-10 w-10 rounded-full border-4 border-slate-700 border-t-emerald-500 animate-spin" />
        <div className="text-xl font-semibold">Geeks POS yuklanmoqda...</div>
        <div className="text-sm text-slate-400">Backend tayyorlanmoqda, iltimos kuting.</div>
      </div>
    </div>
  )
  root.render(splash)

  try {
    const tauriRuntime =
      typeof window !== 'undefined' &&
      typeof (window as unknown as { __TAURI__?: unknown }).__TAURI__ !== 'undefined'
    if (tauriRuntime) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const base = await invoke<string>('get_backend_base_url')
      window.localStorage.setItem(RUNTIME_API_KEY, base)
      for (let i = 0; i < 40; i++) {
        try {
          const health = await fetch(`${base}/api/health/`, { credentials: 'include' })
          if (health.ok) break
        } catch {
          // backend still booting
        }
        await new Promise((resolve) => window.setTimeout(resolve, 250))
      }
    }
  } catch {
    // Keep fallback API base logic in api.ts
  }
  await loadLocale(i18n.language || 'uz')
  const { default: App } = await import('./App.tsx')
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
