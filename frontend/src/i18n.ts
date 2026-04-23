import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import ru from './locales/ru.json'
import uz from './locales/uz.json'

const DEFAULT_LANG = 'uz'
const persistedLang =
  typeof window !== 'undefined' ? window.localStorage.getItem('geeks_pos_lang') : null

void i18n.use(initReactI18next).init({
  resources: {
    uz: { translation: uz },
    ru: { translation: ru },
  },
  lng: persistedLang || DEFAULT_LANG,
  fallbackLng: DEFAULT_LANG,
  interpolation: { escapeValue: false },
})

i18n.on('languageChanged', (lng) => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('geeks_pos_lang', lng)
  }
})

export default i18n
