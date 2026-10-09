import { useQuery } from "@tanstack/react-query"
import { fetchYadioBtcExchangeRate } from "@/core/integrations/yadio/yadio-client.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import { satsToFiat } from "@/core/modules/shared/money.ts"
import { FiatCurrency } from "@/core/modules/shared/schema.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
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
  const appRun = useAppRun()
  const locale = useLocale()
  const { data } = useEvoluQuery(settingsQuery)
  const currency = data[0]?.fiatCurrency ?? FiatCurrency.CZK
  const rateQuery = useQuery({
    queryKey: ["withdraw", "btc-rate", currency],
    queryFn: async () => {
      await using run = appRun()
      const result = await run(fetchYadioBtcExchangeRate(currency))
      if (!result.ok) throw result.error
      return result.value.exchangeRate
    },
    staleTime: 60_000,
    retry: false,
  })
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
