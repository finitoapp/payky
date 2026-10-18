import { formatAmount } from "@payky/app-shared/format-money"
import { fetchLnurlPayMetadata } from "@payky/core/integrations/lnurl/lnurl-pay-client"
import { fetchYadioBtcExchangeRate } from "@payky/core/integrations/yadio/yadio-client"
import {
  activeSparkAccountByIdQuery,
  activeSparkAccountsQuery,
} from "@payky/core/modules/account/account-spark-queries"
import type { AccountId } from "@payky/core/modules/account/account-types"
import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import { getFiatCurrency } from "@payky/core/modules/app-settings/app-settings-utils"
import { satsToFiat } from "@payky/core/modules/shared/money"
import { useEffect, useState } from "react"
import { useAppRun } from "../../hooks/use-app-run.ts"
import { useAsyncValue } from "../../hooks/use-async-value.ts"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"
import { useLocale } from "../../hooks/use-translation.ts"

/** The account the Spark withdrawals are booked to: the active Spark wallet. */
export const useSparkAccountId = (): AccountId | undefined =>
  useEvoluQuery(activeSparkAccountsQuery).data[0]?.id

/**
 * The spendable balance in sats of the Spark wallet `accountId` names, `null`
 * while it loads or when it cannot be read.
 */
export function useSparkBalance(accountId: AccountId): number | null {
  const appRun = useAppRun()
  const [sparkAccount] = useEvoluQuery(
    activeSparkAccountByIdQuery(accountId)
  ).data
  const secret = sparkAccount?.secret
  const { data } = useAsyncValue(
    secret === undefined ? null : `balance:${accountId}`,
    async () => {
      if (secret === undefined) return null
      await using run = appRun()
      await using wallet = await run.deps.sparkWallet.create(secret)
      return (await wallet.getBalance()).availableSats
    }
  )
  return data
}

const RATE_TTL_MS = 60_000
const rates = new Map<string, { readonly at: number; readonly rate: number }>()

/**
 * The shop's fiat currency and today's BTC rate, so the screens can show
 * "≈ 123 CZK" beside a sats amount. The rate is a display aid only, what
 * moves is always sats, and stays `null` while it loads or when Yadio is
 * unreachable.
 */
export function useBtcFiat() {
  const locale = useLocale()
  const appRun = useAppRun()
  const [settings] = useEvoluQuery(settingsQuery).data
  const currency = getFiatCurrency(settings)
  const { data: rate } = useAsyncValue(`rate:${currency}`, async () => {
    const cached = rates.get(currency)
    if (cached !== undefined && Date.now() - cached.at < RATE_TTL_MS) {
      return cached.rate
    }
    await using run = appRun()
    const result = await run(fetchYadioBtcExchangeRate(currency))
    if (!result.ok) throw new Error("Failed to load the BTC exchange rate")
    rates.set(currency, { at: Date.now(), rate: result.value.exchangeRate })
    return result.value.exchangeRate
  })

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

/** `value` once it has stayed the same for `ms`. */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

/** The LNURL-pay metadata behind a Lightning address, `null` waiting for one. */
export function useLnurlPayMetadata(address: string | null) {
  const appRun = useAppRun()
  return useAsyncValue(address, async () => {
    await using run = appRun()
    const result = await run(fetchLnurlPayMetadata({ address: address ?? "" }))
    if (!result.ok) throw new Error("Failed to load LNURL-pay metadata")
    return result.value
  })
}
