import { useCallback, useMemo } from "react"
import { toast } from "sonner"

import {
  cashRegisterAccountQuery,
  cashuAccountQuery,
  fiatBankAccountQuery,
  sparkAccountQuery,
} from "@/core/modules/account/account-queries.ts"
import { updateSettings } from "@/core/modules/app-settings/app-settings-actions.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import type { DefaultPaymentMethod } from "@/core/modules/app-settings/app-settings-types.ts"
import {
  parsePaymentMethodOrder,
  resolveDefaultPaymentMethod,
} from "@/core/modules/app-settings/app-settings-utils.ts"
import { FiatCurrency } from "@/core/modules/shared/schema.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

/** The cards on the payment methods page; bitcoin stands for both backends. */
export type PaymentMethodCardKind = "bank" | "bitcoin" | "cash"

const cardOf = {
  iban: "bank",
  spark: "bitcoin",
  cashu: "bitcoin",
  cashRegister: "cash",
} satisfies Record<DefaultPaymentMethod, PaymentMethodCardKind>

interface DefaultPaymentMethodState {
  /** The card payments open on, `null` while no method is enabled. */
  readonly defaultCard: PaymentMethodCardKind | null
  readonly setDefault: (method: DefaultPaymentMethod) => Promise<void>
}

/**
 * Which payment method the terminal opens payments on, resolved the way
 * the payment screen resolves it: the configured method while it is on,
 * otherwise the first enabled one in tab order. Both bitcoin backends count
 * as enabled while either is, so a default of `cashu` still marks the
 * bitcoin card after the merchant switched the backend to Spark.
 */
export const useDefaultPaymentMethod = (): DefaultPaymentMethodState => {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const { data: settingsData } = useEvoluQuery(settingsQuery)
  const { data: fiatBankAccountData } = useEvoluQuery(fiatBankAccountQuery)
  const { data: sparkAccountData } = useEvoluQuery(sparkAccountQuery)
  const { data: cashuAccountData } = useEvoluQuery(cashuAccountQuery)
  const { data: cashRegisterAccountData } = useEvoluQuery(
    cashRegisterAccountQuery
  )
  const [settings] = settingsData
  const [fiatBankAccount] = fiatBankAccountData
  const [sparkAccount] = sparkAccountData
  const [cashuAccount] = cashuAccountData
  const [cashRegisterAccount] = cashRegisterAccountData
  const fiatCurrency = settings?.fiatCurrency ?? FiatCurrency.CZK
  const configured = settings?.defaultPaymentMethod
  const orderJson = settings?.paymentMethodOrderJson

  const defaultCard = useMemo(() => {
    const bitcoinEnabled =
      (sparkAccount !== undefined && sparkAccount.isDeleted !== 1) ||
      (cashuAccount !== undefined && cashuAccount.isDeleted !== 1)
    const enabledMethods = new Set<DefaultPaymentMethod>()
    if (
      fiatBankAccount !== undefined &&
      fiatBankAccount.isDeleted !== 1 &&
      fiatBankAccount.currency === fiatCurrency
    ) {
      enabledMethods.add("iban")
    }
    if (bitcoinEnabled) {
      enabledMethods.add("spark")
      enabledMethods.add("cashu")
    }
    if (
      cashRegisterAccount !== undefined &&
      cashRegisterAccount.isDeleted !== 1 &&
      cashRegisterAccount.currency === fiatCurrency
    ) {
      enabledMethods.add("cashRegister")
    }
    const method = resolveDefaultPaymentMethod({
      configured,
      enabledMethods,
      order: parsePaymentMethodOrder(orderJson),
    })
    return method === null ? null : cardOf[method]
  }, [
    cashRegisterAccount,
    cashuAccount,
    configured,
    fiatBankAccount,
    fiatCurrency,
    orderJson,
    sparkAccount,
  ])

  const setDefault = useCallback(
    async (method: DefaultPaymentMethod) => {
      try {
        await using run = appRun()
        await run(updateSettings({ defaultPaymentMethod: method }))
      } catch {
        toast.error(t("settings.saveFailed"))
      }
    },
    [appRun, t]
  )

  return { defaultCard, setDefault }
}
