import { useQuery } from "@tanstack/react-query"

import { fetchYadioBtcExchangeRate } from "@/core/integrations/yadio/yadio-client.ts"
import type { FiatCurrency } from "@/core/modules/shared/schema.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"

/**
 * Today's BTC rate in `currency` (fiat per BTC), from Yadio. One query key
 * for every screen that shows it, so the withdrawal and donation screens
 * share the cached rate instead of each fetching their own. No retries:
 * Yadio is rate-limited, and both screens already show a missing rate.
 */
export const useBtcExchangeRate = (currency: FiatCurrency) => {
  const appRun = useAppRun()
  return useQuery({
    queryKey: ["btc-exchange-rate", currency],
    queryFn: async () => {
      await using run = appRun()
      const result = await run(fetchYadioBtcExchangeRate(currency))
      if (!result.ok) {
        run.deps.console.warn(
          "Failed to load the BTC exchange rate",
          result.error
        )
        throw result.error
      }
      return result.value.exchangeRate
    },
    staleTime: 60_000,
    retry: false,
  })
}
