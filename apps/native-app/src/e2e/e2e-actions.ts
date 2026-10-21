import { updateDeviceSettings } from "@payky/core/evolu/device-account"
import { getDeviceLocaleForLanguage } from "@payky/core/evolu/device-client"
import {
  saveCashRegisterAccount,
  saveFiatBankAccount,
  saveSparkAccount,
} from "@payky/core/modules/account/account-actions"
import { completeOnboarding } from "@payky/core/modules/app-settings/app-settings-actions"
import { PaymentMethodOrderJson } from "@payky/core/modules/app-settings/app-settings-utils"
import { latestBillsQuery } from "@payky/core/modules/bill/bill-queries"
import { latestPaymentsQuery } from "@payky/core/modules/payment/payment-queries"
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

  /**
   * One warning through the run's console (a release build keeps warnings and
   * up), so the debug console has an entry: web's spec reads the ones
   * onboarding logged, which the seed's relaunch clears on native.
   */
  log: async (run) => {
    run.deps.console.warn("e2e log")
    return undefined
  },

  /**
   * The ids web's specs read off the URL (`/bill?billId=`, `/payment/<id>`),
   * which a flow cannot: the newest bill's and payment's, printed as
   * `bill=<id> payment=<id>` (`-` for none). `subflows/read-ids.yaml` keeps
   * them as `output.billId` and `output.paymentId`.
   */
  lastIds: async (run) => {
    const [bill] = await run.deps.evolu.loadQuery(latestBillsQuery(1))
    const [payment] = await run.deps.evolu.loadQuery(latestPaymentsQuery(1))
    return `bill=${bill?.id ?? "-"} payment=${payment?.id ?? "-"}`
  },
}
