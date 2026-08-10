import { useEffect } from "react"

import {
  saveCashRegisterAccount,
  saveFiatBankAccount,
  saveSparkAccount,
} from "@/core/modules/account/account-actions.ts"
import { createAccountTransaction } from "@/core/modules/account-transaction/account-transaction-actions.ts"
import { completeOnboarding } from "@/core/modules/app-settings/app-settings-actions.ts"
import { paymentSparkDetailsByIdQuery } from "@/core/modules/payment/payment-queries.ts"
import { PaymentId } from "@/core/modules/payment/payment-types.ts"
import { reconcileAccountTransaction } from "@/core/modules/reconciliation-claim/reconciliation-claim-actions.ts"
import {
  BankAccountInputIbanSchema,
  FiatCurrency,
  NonEmptyStringSchema,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"

declare global {
  interface Window {
    __e2eSeedOnboarding?: (options?: {
      readonly spark?: boolean
    }) => Promise<void>
    __e2eMarkSparkPaid?: (paymentId: string) => Promise<void>
  }
}

/**
 * Exposes `window.__e2eSeedOnboarding`, which writes the same account/settings
 * rows the onboarding UI would (cash + IBAN enabled, USD, tips on defaults;
 * pass `{ spark: true }` to also enable Spark), so e2e specs can skip
 * clicking through onboarding.
 *
 * Also exposes `window.__e2eMarkSparkPaid`, which simulates an incoming Spark
 * transfer settling a prepared Spark payment: it mirrors what
 * `spark-account-transaction-sync-job.ts`'s `recordTransfer` does for a real
 * transfer (`createAccountTransaction` + `reconcileAccountTransaction`)
 * without touching the Spark wallet SDK, since there is no counterparty to
 * actually pay the invoice in a test run.
 *
 * Both are dead code in any real production build: kept alive only in dev
 * (`import.meta.env.DEV`) and in the one production build
 * `bun run test:e2e:build` produces via the `PAYKY_E2E_BUILD`-gated
 * `__E2E_TEST_BUILD__` define (see vite.config.ts) — `import.meta.env.DEV`
 * alone is false in every `vite build` output regardless of how it's later
 * served, so it can't gate this for that case.
 */
export function E2eTestBridge() {
  const appRun = useAppRun()

  useEffect(() => {
    if (!import.meta.env.DEV && !__E2E_TEST_BUILD__) return

    window.__e2eSeedOnboarding = async (options) => {
      const sparkEnabled = options?.spark ?? false
      await using run = appRun()

      await run(
        saveCashRegisterAccount({ enabled: true, currency: FiatCurrency.USD })
      )
      await run(saveSparkAccount({ enabled: sparkEnabled }))
      await run(
        saveFiatBankAccount({
          enabled: true,
          iban: BankAccountInputIbanSchema.parse("CZ6508000000192000145399"),
          currency: FiatCurrency.USD,
        })
      )
      await run(
        completeOnboarding({
          fiatCurrency: FiatCurrency.USD,
          defaultPaymentMethod: "cashRegister",
          paymentMethodOrderJson: JSON.stringify(
            sparkEnabled
              ? ["spark", "iban", "cashRegister"]
              : ["iban", "cashRegister"]
          ),
        })
      )
    }

    window.__e2eMarkSparkPaid = async (paymentIdValue) => {
      const parsedPaymentId = PaymentId.parse(paymentIdValue)
      await using run = appRun()

      const [sparkDetails] = await run.deps.evolu.loadQuery(
        paymentSparkDetailsByIdQuery(parsedPaymentId)
      )
      if (!sparkDetails) {
        throw new Error(
          `No prepared Spark payment found for payment ${parsedPaymentId}.`
        )
      }

      const accountTransactionId = await run.orThrow(
        createAccountTransaction({
          accountId: sparkDetails.accountId,
          amount: sparkDetails.amountSats,
          currency: "BTC",
          occurredAt: TimestampMsSchema.decode(run.deps.date.now().getTime()),
          note: null,
          internalTransferGroupId: null,
          source: { deviceId: null, source: "auto" },
          spark: {
            sparkTransferId: NonEmptyStringSchema.decode(
              `e2e:${parsedPaymentId}`
            ),
            ...(sparkDetails.lnInvoice === null
              ? {}
              : {
                  lightning: {
                    lnInvoice: NonEmptyStringSchema.decode(
                      sparkDetails.lnInvoice
                    ),
                    preImage: null,
                    paymentHash: null,
                  },
                }),
            ...(sparkDetails.sparkInvoice === null
              ? {}
              : {
                  sparkInvoice: {
                    sparkInvoice: NonEmptyStringSchema.decode(
                      sparkDetails.sparkInvoice
                    ),
                  },
                }),
          },
        })
      )

      await run.orThrow(reconcileAccountTransaction(accountTransactionId))
    }

    return () => {
      delete window.__e2eSeedOnboarding
      delete window.__e2eMarkSparkPaid
    }
  }, [appRun])

  return null
}
