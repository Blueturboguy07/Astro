/* Numbers on the stock card (Astro 0.2.4 QA, F-076): volume is a count of
   shares, not money, and showed "$45.01M"; market cap uses the quote's
   currency, not "$" for every exchange. */

/** 45,010,000 -> "45.01M". No currency sign: for share counts. */
export const formatCompact = (
  num: number | undefined | null,
): string => {
  if (num === undefined || num === null || Number.isNaN(num)) return 'N/A'
  const abs = Math.abs(num)
  if (abs >= 1e12) return `${(num / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${(num / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(num / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${(num / 1e3).toFixed(2)}K`
  return `${Math.round(num)}`
}

const currencySymbol = (currency: string | undefined, locale?: string) => {
  if (!currency) return ''
  try {
    const part = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    })
      .formatToParts(0)
      .find((p) => p.type === 'currency')
    return part?.value ?? ''
  } catch {
    return ''
  }
}

/** Market cap: "$5.13T". */
export const formatMoneyCompact = (
  num: number | undefined | null,
  currency?: string,
  locale?: string,
): string => {
  const compact = formatCompact(num)
  return compact === 'N/A' ? compact : `${currencySymbol(currency, locale)}${compact}`
}
