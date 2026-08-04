import { useEffect } from "react"

import {
  saveCashRegisterAccount,
  saveFiatBankAccount,
  saveSparkAccount,
} from "@/core/modules/account/account-actions.ts"
import { completeOnboarding } from "@/core/modules/app-settings/app-settings-actions.ts"
import {
  BankAccountInputIbanSchema,
  FiatCurrency,
} from "@/core/modules/shared/schema.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"

declare global {
  interface Window {
    __e2eSeedOnboarding?: () => Promise<void>
  }
}

/**
 * Exposes `window.__e2eSeedOnboarding`, which writes the same account/settings
 * rows the onboarding UI would (cash + IBAN enabled, USD, tips on defaults),
 * so e2e specs can skip clicking through onboarding. Dead code in any real
 * production build: kept alive only in dev (`import.meta.env.DEV`) and in the
 * one production build `bun run test:e2e:build` produces via the
 * `PAYKY_E2E_BUILD`-gated `__E2E_TEST_BUILD__` define (see vite.config.ts) —
 * `import.meta.env.DEV` alone is false in every `vite build` output
 * regardless of how it's later served, so it can't gate this for that case.
 */
export function E2eTestBridge() {
  const appRun = useAppRun()

  useEffect(() => {
    if (!import.meta.env.DEV && !__E2E_TEST_BUILD__) return

    window.__e2eSeedOnboarding = async () => {
      await using run = appRun()

      await run(
        saveCashRegisterAccount({ enabled: true, currency: FiatCurrency.USD })
      )
      await run(saveSparkAccount({ enabled: false }))
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
          paymentMethodOrderJson: JSON.stringify(["iban", "cashRegister"]),
        })
      )
    }

    return () => {
      delete window.__e2eSeedOnboarding
    }
  }, [appRun])

  return null
}
