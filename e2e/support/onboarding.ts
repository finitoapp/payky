import type { Page } from "@playwright/test"

import type { FiatCurrency } from "../../src/core/modules/shared/schema.ts"
import type { Language, TranslationKey } from "../../src/i18n/resources.ts"
import { translate } from "./i18n.ts"

/**
 * The country and currency dropdowns on the second onboarding step. Both are
 * `Select`s labeled by their `FieldLabel`, so they are addressed by role and
 * label rather than by the option text the way the old toggle groups were.
 */
export async function chooseOnboardingCountry(
  page: Page,
  language: Language,
  countryKey: TranslationKey
): Promise<void> {
  await page
    .getByRole("combobox", {
      name: translate(language, "settings.legalEntity.country.label"),
    })
    .click()
  await page
    .getByRole("option", { name: translate(language, countryKey) })
    .click()
}

export async function chooseOnboardingCurrency(
  page: Page,
  language: Language,
  currencyKey: TranslationKey
): Promise<void> {
  await page
    .getByRole("combobox", {
      name: translate(language, "onboarding.countryCurrency.currency.label"),
    })
    .click()
  await page
    .getByRole("option", { name: translate(language, currencyKey) })
    .click()
}

/**
 * Runner-agnostic: `bin/generate-doc-screenshots.ts` imports these helpers
 * outside the Playwright test runner, so nothing here may call `test.step(...)`
 * — it throws "test.step() can only be called from a test" there.
 */
/**
 * Seeds onboarding for whichever account is currently active on the page via
 * `window.__e2eSeedOnboarding` (see src/components/e2e-test-bridge.tsx),
 * which writes the same account/settings rows `completeOnboarding` produces
 * (cash + IBAN enabled, USD, tips on defaults), then waits for the app's own
 * reactive redirect off the onboarding page. Assumes the app has already
 * loaded on the current page (the bridge mounts for every route).
 */
export async function seedCurrentAccountOnboarding(
  page: Page,
  language: Language,
  options?: { readonly spark?: boolean; readonly fiatCurrency?: FiatCurrency }
): Promise<void> {
  // Retried, because the document can be replaced under this call — only a
  // *document* navigation destroys an execution context, so a client-side
  // route change is not the hazard here; a service-worker takeover or Evolu's
  // own `reloadApp` is. Every spec goes through the `seededPage` fixture, so
  // losing the context here surfaces as an unrelated spec failing in its
  // first step, with an error that says nothing about the spec.
  //
  // Safe to repeat: the seed is four singleton upserts (the cash/Spark/bank
  // account rows and the settings row), so a half-applied seed plus a full
  // re-run converges on the same state.
  for (let attempt = 0; ; attempt += 1) {
    try {
      await page.waitForFunction(
        () => typeof window.__e2eSeedOnboarding === "function"
      )
      await page.evaluate(
        (seedOptions) => window.__e2eSeedOnboarding?.(seedOptions),
        options
      )
      break
    } catch (error) {
      // Narrow on purpose: anything else is a real failure and must not be
      // retried into a timeout that hides it.
      const lostContext =
        error instanceof Error &&
        error.message.includes("Execution context was destroyed")
      if (attempt >= 2 || !lostContext) throw error
      await page.waitForLoadState("domcontentloaded")
    }
  }
  await page
    .getByRole("button", { name: translate(language, "settings.title") })
    .waitFor()
}

/**
 * Reaches the terminal home screen without clicking through onboarding. Use
 * this in specs that don't test onboarding itself — `completeOnboarding()`
 * remains the one exercising the real onboarding UI. Pass `{ spark: true }`
 * to also enable the Spark payment method (disabled by default).
 */
export async function seedOnboarding(
  page: Page,
  language: Language,
  options?: { readonly spark?: boolean; readonly fiatCurrency?: FiatCurrency }
): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await seedCurrentAccountOnboarding(page, language, options)
}

/** Completes onboarding as a new account and returns its recovery phrase. */
export async function completeOnboarding(
  page: Page,
  language: Language,
  options?: { readonly baseURL?: string }
): Promise<string> {
  await page.goto(options?.baseURL ?? "/", { waitUntil: "domcontentloaded" })
  await page
    .getByRole("heading", { name: translate(language, "onboarding.title") })
    .waitFor()
  await page
    .getByRole("button", {
      name: translate(language, "onboarding.accountChoice.new.title"),
    })
    .click()
  await chooseOnboardingCountry(page, language, "country.cz")
  await page
    .getByRole("button", { name: translate(language, "onboarding.next") })
    .click()
  await page
    .getByRole("checkbox", {
      name: translate(language, "onboarding.payments.btc.title"),
    })
    .click()
  await page.getByRole("textbox").fill("CZ6508000000192000145399")
  await page
    .getByRole("button", { name: translate(language, "onboarding.next") })
    .click()
  const mnemonic = await page
    .getByRole("textbox", {
      name: translate(language, "settings.security.mnemonic.label"),
    })
    .inputValue()
  await page
    .getByRole("checkbox", {
      name: translate(language, "onboarding.account.mnemonic.confirm"),
    })
    .click()
  await page
    .getByRole("button", { name: translate(language, "onboarding.finish") })
    .click()
  await page
    .getByRole("button", { name: translate(language, "settings.title") })
    .waitFor()
  return mnemonic
}

/**
 * Completes onboarding for an account that is already selected and already
 * on the onboarding flow (for example right after creating a new device
 * account from Settings > Accounts), accepting every default. Unlike
 * completeOnboarding, this does not navigate or change which payment methods
 * are enabled — it only fills the IBAN the default bank transfer requires.
 *
 * Used instead of the window.__e2eSeedOnboarding bridge for a second device
 * account: switching accounts recreates the app's Evolu client, and the
 * bridge's effect doesn't reliably reattach to the new one in time.
 */
export async function completeOnboardingDefaults(
  page: Page,
  language: Language
): Promise<void> {
  await page
    .getByRole("heading", { name: translate(language, "onboarding.title") })
    .waitFor()
  await page
    .getByRole("button", {
      name: translate(language, "onboarding.accountChoice.new.title"),
    })
    .click()
  await chooseOnboardingCountry(page, language, "country.cz")
  await page
    .getByRole("button", { name: translate(language, "onboarding.next") })
    .click()
  await page.getByRole("textbox").fill("CZ6508000000192000145399")
  await page
    .getByRole("button", { name: translate(language, "onboarding.next") })
    .click()
  await page
    .getByRole("checkbox", {
      name: translate(language, "onboarding.account.mnemonic.confirm"),
    })
    .click()
  await page
    .getByRole("button", { name: translate(language, "onboarding.finish") })
    .click()
  await page
    .getByRole("button", { name: translate(language, "settings.title") })
    .waitFor()
}
