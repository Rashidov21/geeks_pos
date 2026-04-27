import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const DEFAULT_LANG = 'uz'
const persistedLang =
  typeof window !== 'undefined' ? window.localStorage.getItem('geeks_pos_lang') : null

void i18n.use(initReactI18next).init({
  resources: {},
  partialBundledLanguages: true,
  lng: persistedLang || DEFAULT_LANG,
  fallbackLng: DEFAULT_LANG,
  interpolation: { escapeValue: false },
})

export async function loadLocale(lang: string) {
  if (i18n.hasResourceBundle(lang, 'translation')) return
  const mod = lang.startsWith('ru')
    ? await import('./locales/ru.json')
    : await import('./locales/uz.json')
  i18n.addResourceBundle(lang.startsWith('ru') ? 'ru' : 'uz', 'translation', mod.default, true, true)
}

i18n.on('languageChanged', (lng) => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('geeks_pos_lang', lng)
  }
  void loadLocale(lng)
})

void loadLocale(persistedLang || DEFAULT_LANG)

export default i18n
