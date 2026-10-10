import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import { satsToFiat } from "@/core/modules/shared/money.ts"
import { FiatCurrency } from "@/core/modules/shared/schema.ts"
import { useBtcExchangeRate } from "@/hooks/use-btc-exchange-rate.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { formatAmount } from "@/lib/format-utils.ts"

/**
 * The shop's fiat currency and today's BTC rate, so the withdrawal screens
 * can show "≈ 123 CZK" beside every sats amount. The rate is a display aid
 * only — what moves is always sats — and stays `null` while it loads or when
 * Yadio is unreachable.
 */
export function useBtcFiat() {
  const locale = useLocale()
  const { data } = useEvoluQuery(settingsQuery)
  const currency = data[0]?.fiatCurrency ?? FiatCurrency.CZK
  const rateQuery = useBtcExchangeRate(currency)
  const rate = rateQuery.data ?? null

  return {
    currency,
    rate,
    /** "≈ 12.30 CZK" for `sats`, or `null` without a rate. */
    approx: (sats: number): string | null =>
      rate === null
        ? null
        : `≈ ${formatAmount(satsToFiat({ sats, exchangeRate: rate }), currency, locale)}`,
  }
}
