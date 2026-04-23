import { useTranslation } from 'react-i18next'

type Section = 'dashboard' | 'pos' | 'catalog' | 'debts' | 'sales' | 'settings'

const ITEMS: Array<{ id: Section; labelKey: string }> = [
  { id: 'dashboard', labelKey: 'admin.sidebar.dashboard' },
  { id: 'pos', labelKey: 'admin.sidebar.pos' },
  { id: 'catalog', labelKey: 'admin.sidebar.catalog' },
  { id: 'debts', labelKey: 'admin.sidebar.debts' },
  { id: 'sales', labelKey: 'admin.sidebar.sales' },
  { id: 'settings', labelKey: 'admin.sidebar.settings' },
]

export function AdminSidebar({
  active,
  onSelect,
  role,
}: {
  active: Section
  onSelect: (s: Section) => void
  role: 'CASHIER' | 'ADMIN' | 'OWNER'
}) {
  const { t, i18n } = useTranslation()
  const visibleItems =
    role === 'CASHIER'
      ? ITEMS.filter((item) => !['catalog', 'settings', 'debts'].includes(item.id))
      : ITEMS

  return (
    <aside className="w-60 border-r border-slate-800 bg-slate-950 p-3">
      <div className="text-sm text-slate-400 px-2 pb-2">{t('admin.sidebar.title')}</div>
      <div className="flex gap-2 px-2 pb-3">
        <button
          type="button"
          className={`text-xs px-2 py-1 rounded border ${
            i18n.language.startsWith('uz')
              ? 'bg-emerald-700 border-emerald-500 text-white'
              : 'bg-slate-800 border-slate-600 text-slate-200'
          }`}
          onClick={() => i18n.changeLanguage('uz')}
        >
          {t('lang.uz')}
        </button>
        <button
          type="button"
          className={`text-xs px-2 py-1 rounded border ${
            i18n.language.startsWith('ru')
              ? 'bg-emerald-700 border-emerald-500 text-white'
              : 'bg-slate-800 border-slate-600 text-slate-200'
          }`}
          onClick={() => i18n.changeLanguage('ru')}
        >
          {t('lang.ru')}
        </button>
      </div>
      <div className="space-y-1">
        {visibleItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={`w-full text-left px-3 py-2 rounded text-sm border ${
              active === item.id
                ? 'bg-emerald-700 border-emerald-500'
                : 'bg-slate-900 border-slate-700 hover:bg-slate-800'
            }`}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>
    </aside>
  )
}

export type { Section }
