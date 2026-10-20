import { updateDeviceSettings } from "@payky/core/evolu/device-account"
import { getDeviceLocaleForLanguage } from "@payky/core/evolu/device-client"
import {
  saveCashRegisterAccount,
  saveFiatBankAccount,
  saveSparkAccount,
} from "@payky/core/modules/account/account-actions"
import { completeOnboarding } from "@payky/core/modules/app-settings/app-settings-actions"
import { PaymentMethodOrderJson } from "@payky/core/modules/app-settings/app-settings-utils"
import {
  BankAccountInputIbanSchema,
  FiatCurrency,
} from "@payky/core/modules/shared/schema"
import { z } from "zod"
import type { NativeAppRun } from "../hooks/use-app-run.ts"

/**
 * What a flow opens `/e2e/<action>?<params>` for: the native twin of web's
 * `window.__e2e*` functions (`e2e-test-bridge.tsx`), since Maestro cannot call
 * into the app. An action reads its params with zod, throws on failure, and
 * may return a value the bridge page prints for `assertVisible`.
 */
type E2eAction = (
  run: NativeAppRun,
  params: Readonly<Record<string, string>>
) => Promise<string | undefined>

const SeedOnboardingParams = z.object({
  spark: z.stringbool().default(false),
  fiatCurrency: z.enum(FiatCurrency).default(FiatCurrency.USD),
})

export const e2eActions: Readonly<Record<string, E2eAction>> = {
  ping: async () => undefined,

  /**
   * `__e2eSeedOnboarding`: the rows the onboarding UI writes (cash + IBAN,
   * USD, tips on defaults; `spark=true` adds Spark, `fiatCurrency=` another
   * currency), plus English, so no flow depends on the device locale.
   */
  seedOnboarding: async (run, params) => {
    const { spark, fiatCurrency } = SeedOnboardingParams.parse(params)
    updateDeviceSettings(run.deps.deviceEvolu, {
      language: "en",
      locale: getDeviceLocaleForLanguage("en"),
    })
    await run.ok(
      saveCashRegisterAccount({ enabled: true, currency: fiatCurrency })
    )
    await run.ok(saveSparkAccount({ enabled: spark }))
    await run.ok(
      saveFiatBankAccount({
        enabled: true,
        iban: BankAccountInputIbanSchema.parse("CZ6508000000192000145399"),
        currency: fiatCurrency,
      })
    )
    await run.orThrow(
      completeOnboarding({
        fiatCurrency,
        defaultPaymentMethod: "cashRegister",
        paymentMethodOrderJson: z.encode(
          PaymentMethodOrderJson,
          spark ? ["spark", "iban", "cashRegister"] : ["iban", "cashRegister"]
        ),
      })
    )
    return undefined
  },
}
