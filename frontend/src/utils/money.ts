export function toIntAmount(value: string | number | null | undefined): number {
  const n = Number(String(value ?? '0').replace(',', '.'))
  if (!Number.isFinite(n)) return 0
  return Math.round(n)
}

export function formatMoney(value: string | number | null | undefined): string {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(toIntAmount(value))
}

