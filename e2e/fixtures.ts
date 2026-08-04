import type { Page } from "@playwright/test"
import { test as base } from "@playwright/test"
import {
  type Language,
  resources,
  type TranslationKey,
} from "../src/i18n/resources.ts"

export const pageWidth = 406
export const pageHeight = 818

const languageOptionKeyByLanguage: Record<Language, TranslationKey> = {
  en: "settings.language.english.title",
  cs: "settings.language.czech.title",
  sk: "settings.language.slovak.title",
}

export function translate(language: Language, key: TranslationKey): string {
  return resources[language][key]
}

/** `translate()` for a `{value}`-templated key, e.g. `"settings.tips.percentages.value"` ("{value}%"). */
export function translateValue(
  language: Language,
  key: TranslationKey,
  value: string | number
): string {
  return translate(language, key).replace("{value}", String(value))
}

/**
 * Navigates to `path` and waits for a heading with `headingKey`'s text, the
 * pattern almost every spec starts with. `path` is a pathname (e.g.
 * "/settings/theme").
 */
export async function gotoPage(
  page: Page,
  path: string,
  language: Language,
  headingKey: TranslationKey
): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded" })
  await page
    .getByRole("heading", { name: translate(language, headingKey) })
    .waitFor()
}

/**
 * Reloads the current page and waits for a heading with `headingKey`'s
 * text again, the pattern every "verify X persists after reload" step uses.
 */
export async function reloadPage(
  page: Page,
  language: Language,
  headingKey: TranslationKey
): Promise<void> {
  await page.reload({ waitUntil: "domcontentloaded" })
  await page
    .getByRole("heading", { name: translate(language, headingKey) })
    .waitFor()
}

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
  language: Language
): Promise<void> {
  await page.waitForFunction(
    () => typeof window.__e2eSeedOnboarding === "function"
  )
  await page.evaluate(() => window.__e2eSeedOnboarding?.())
  await page
    .getByRole("button", { name: translate(language, "settings.title") })
    .waitFor()
}

/**
 * Reaches the terminal home screen without clicking through onboarding. Use
 * this in specs that don't test onboarding itself — `completeOnboarding()`
 * remains the one exercising the real onboarding UI.
 */
export async function seedOnboarding(
  page: Page,
  language: Language
): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await seedCurrentAccountOnboarding(page, language)
}

interface Fixtures {
  /**
   * A page already seeded through `seedOnboarding()` (English). Use this
   * instead of the default `page` fixture in specs that don't test
   * onboarding itself, to skip the manual seed step in every test.
   */
  readonly seededPage: Page
}

/** `test`/`expect` re-exported so specs only need one import source. */
export const test = base.extend<Fixtures>({
  seededPage: async ({ page }, use) => {
    await seedOnboarding(page, "en")
    await use(page)
  },
})
export { expect } from "@playwright/test"

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
      name: translate(language, languageOptionKeyByLanguage[language]),
    })
    .click()
  await page
    .getByRole("button", { name: translate(language, "onboarding.next") })
    .click()
  await page
    .getByRole("button", {
      name: translate(language, "onboarding.accountChoice.new.title"),
    })
    .click()
  await page
    .getByRole("button", { name: translate(language, "onboarding.next") })
    .click()
  await page
    .getByRole("button", { name: translate(language, "onboarding.next") })
    .click()
  await page
    .getByRole("checkbox", {
      name: translate(language, "onboarding.payments.btc.title"),
    })
    .click()
  await page
    .getByRole("checkbox", {
      name: translate(language, "onboarding.payments.iban.title"),
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
 * completeOnboarding, this does not navigate or pick a language/payment
 * methods.
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
    .getByRole("button", { name: translate(language, "onboarding.next") })
    .click()
  await page
    .getByRole("button", {
      name: translate(language, "onboarding.accountChoice.new.title"),
    })
    .click()
  await page
    .getByRole("button", { name: translate(language, "onboarding.next") })
    .click()
  await page
    .getByRole("button", { name: translate(language, "onboarding.next") })
    .click()
  await page
    .getByRole("button", { name: translate(language, "onboarding.next") })
    .click()
  await page
    .getByRole("button", { name: translate(language, "onboarding.finish") })
    .click()
  await page
    .getByRole("button", { name: translate(language, "settings.title") })
    .waitFor()
}

export async function enterAmount(
  page: Page,
  language: Language
): Promise<void> {
  await page.getByRole("button", { name: "5", exact: true }).click()
  await page
    .getByRole("button", {
      name: translate(language, "home.keypad.decimal"),
    })
    .click()
  await page.getByRole("button", { name: "9", exact: true }).click()
}

export async function createPayment(
  page: Page,
  language: Language
): Promise<void> {
  await enterAmount(page, language)
  await page
    .getByRole("button", { name: translate(language, "home.pay") })
    .click()

  const ibanTab = page.getByRole("tab", {
    name: translate(language, "paymentWait.method.iban"),
  })
  const skipTipButton = page.getByRole("button", {
    name: translate(language, "paymentTip.none"),
  })
  await ibanTab.or(skipTipButton).first().waitFor()

  if (await skipTipButton.isVisible()) {
    await skipTipButton.click()
    await page
      .getByRole("button", {
        name: translate(language, "paymentTip.continue"),
      })
      .click()
    await ibanTab.waitFor()
  }
}

export async function markCashPaid(
  page: Page,
  language: Language
): Promise<void> {
  await page
    .getByRole("button", {
      name: translate(language, "paymentWait.cashPaid.action"),
    })
    .click()
  await page
    .getByTestId("payment-paid-panel")
    .getByText(translate(language, "paymentWait.paid"))
    .waitFor()
}
