import type { Page } from "@playwright/test"
import { test as base, expect } from "@playwright/test"
import type { FiatCurrency } from "../src/core/modules/shared/schema.ts"
import {
  type Language,
  resources,
  type TranslationKey,
} from "../src/i18n/resources.ts"

export { pageHeight, pageWidth } from "./viewport.ts"

const languageOptionKeyByLanguage: Record<Language, TranslationKey> = {
  en: "settings.language.english.title",
  cs: "settings.language.czech.title",
  sk: "settings.language.slovak.title",
}

export function translate(language: Language, key: TranslationKey): string {
  return resources[language][key]
}

/** `translate()` for a `{name}`-templated key, e.g. `"bill.brick.add.aria"`. Always English — every current call site only ever needs it in the default test language. */
export function nameParam(key: TranslationKey, name: string): string {
  return translate("en", key).replace("{name}", name)
}

/**
 * Playwright's own artifact directory (already git-ignored — see
 * .gitignore's "Playwright" section) — screenshots taken explicitly by a
 * spec live alongside its auto-captured failure screenshots instead of a
 * new, separately-ignored directory.
 */
export const screenshotDir = "test-results/e2e-screenshots"

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
  language: Language,
  options?: { readonly spark?: boolean; readonly fiatCurrency?: FiatCurrency }
): Promise<void> {
  await page.waitForFunction(
    () => typeof window.__e2eSeedOnboarding === "function"
  )
  await page.evaluate(
    (seedOptions) => window.__e2eSeedOnboarding?.(seedOptions),
    options
  )
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
export { expect }

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

/**
 * Navigates to "/" and ensures the home screen is showing tables/POS mode,
 * switching it via the home icon if it isn't already (the choice persists
 * across navigations, so this is a no-op once a test has switched once).
 * Waits for the "no table" tile, so the grid is ready to interact with.
 */
export async function gotoPosOverview(
  page: Page,
  language: Language
): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  const noTableTile = page.getByTestId("no-table-tile")
  const switchToPos = page.getByRole("button", {
    name: translate(language, "nav.pos"),
  })
  await noTableTile.or(switchToPos).first().waitFor()
  if (await switchToPos.isVisible()) {
    await switchToPos.click()
  }
  await noTableTile.waitFor()
}

/**
 * Switches the home screen into tables/POS mode via the home icon and
 * starts a new bill via the "no table" tile's "+" link, landing on the
 * bill page. Assumes the page is already on "/".
 */
export async function startNewBill(
  page: Page,
  language: Language
): Promise<void> {
  await page
    .getByRole("button", { name: translate(language, "nav.pos") })
    .click()
  await page
    .getByTestId("no-table-tile")
    .getByRole("link", { name: translate(language, "tables.tile.newBill") })
    .click()
  await page
    .getByRole("heading", { name: translate(language, "bill.title") })
    .waitFor()
}

/**
 * Starts a fresh bill and adds one "Coffee" ($5) brick to it (assumes a
 * catalog item named "Coffee" was already seeded via `addCatalogItem`),
 * returning its bill id read off the URL. Leaves the page on the bill's own
 * cart view. Uses `gotoPosOverview` (tolerant of already being in POS/tables
 * mode, e.g. right after a previous bill's pay cycle in the same test)
 * rather than assuming the numpad is showing.
 */
export async function startBillWithCoffee(
  page: Page,
  language: Language
): Promise<string> {
  await gotoPosOverview(page, language)
  await page
    .getByTestId("no-table-tile")
    .getByRole("link", { name: translate(language, "tables.tile.newBill") })
    .click()
  await page
    .getByRole("heading", { name: translate(language, "bill.title") })
    .waitFor()
  await page
    .getByRole("button", {
      name: translate(language, "bill.brick.add.aria").replace(
        "{name}",
        "Coffee"
      ),
    })
    .click()

  await expect
    .poll(() => new URL(page.url()).searchParams.get("billId"))
    .not.toBeNull()
  const billId = new URL(page.url()).searchParams.get("billId")
  if (!billId) {
    throw new Error("Could not determine bill id from URL.")
  }
  return billId
}

/**
 * `startBillWithCoffee`, then begins a cash payment for it, skipping the tip
 * screen — shared setup for specs that need a bill mid-payment (coverage-
 * mismatch and collision scenarios). Leaves the page on the payment wait
 * screen, not yet marked paid.
 */
export async function startBillAndBeginCashPayment(
  page: Page,
  language: Language
): Promise<string> {
  const billId = await startBillWithCoffee(page, language)

  await page
    .getByRole("button", { name: translate(language, "home.pay") })
    .click()
  const skipTipButton = page.getByRole("button", {
    name: translate(language, "paymentTip.none"),
  })
  const cashPaidButton = page.getByRole("button", {
    name: translate(language, "paymentWait.cashPaid.action"),
  })
  await skipTipButton.or(cashPaidButton).first().waitFor()
  if (await skipTipButton.isVisible()) {
    await skipTipButton.click()
    await page
      .getByRole("button", { name: translate(language, "paymentTip.continue") })
      .click()
    await cashPaidButton.waitFor()
  }

  return billId
}

/** Adds a catalog item through the real settings UI (used to seed items for cart specs). */
export async function addCatalogItem(
  page: Page,
  language: Language,
  input: {
    readonly name: string
    readonly price: string
    readonly categoryName?: string
  }
): Promise<void> {
  await gotoPage(page, "/settings/items", language, "settings.items.title")
  await page
    .getByRole("button", { name: translate(language, "settings.items.add") })
    .click()
  await page
    .getByRole("heading", {
      name: translate(language, "settings.items.form.title.create"),
    })
    .waitFor()
  await page
    .getByRole("textbox", {
      name: translate(language, "settings.items.form.name.label"),
    })
    .fill(input.name)
  await page
    .getByRole("textbox", {
      name: translate(language, "settings.items.form.price.label"),
    })
    .fill(input.price)
  if (input.categoryName !== undefined) {
    await page
      .getByRole("combobox", {
        name: translate(language, "settings.items.form.category.label"),
      })
      .click()
    await page.getByRole("option", { name: input.categoryName }).click()
  }
  await page
    .getByRole("button", {
      name: translate(language, "settings.items.form.save.create"),
    })
    .click()
  await page
    .getByRole("heading", { name: translate(language, "settings.items.title") })
    .waitFor()
}

/** Adds a catalog category through the real settings UI (used to seed categories for bill filter specs). */
export async function addCatalogCategory(
  page: Page,
  language: Language,
  name: string
): Promise<void> {
  await gotoPage(
    page,
    "/settings/categories",
    language,
    "settings.categories.title"
  )
  await page
    .getByRole("button", {
      name: translate(language, "settings.categories.add"),
    })
    .click()
  await page
    .getByRole("heading", {
      name: translate(language, "settings.categories.form.title.create"),
    })
    .waitFor()
  await page
    .getByRole("textbox", {
      name: translate(language, "settings.categories.form.name.label"),
    })
    .fill(name)
  await page
    .getByRole("button", {
      name: translate(language, "settings.categories.form.save.create"),
    })
    .click()
  await page
    .getByRole("heading", {
      name: translate(language, "settings.categories.title"),
    })
    .waitFor()
}

/** Adds a table through the real settings UI (used to seed tables for bill/floor-view specs). */
export async function addTable(
  page: Page,
  language: Language,
  input: { readonly name: string; readonly seatCount: string }
): Promise<void> {
  await gotoPage(page, "/settings/tables", language, "settings.tables.title")
  await page
    .getByRole("button", { name: translate(language, "settings.tables.add") })
    .click()
  await page
    .getByRole("heading", {
      name: translate(language, "settings.tables.form.title.create"),
    })
    .waitFor()
  await page
    .getByRole("textbox", {
      name: translate(language, "settings.tables.form.name.label"),
    })
    .fill(input.name)
  await page
    .getByRole("textbox", {
      name: translate(language, "settings.tables.form.seatCount.label"),
    })
    .fill(input.seatCount)
  await page
    .getByRole("button", {
      name: translate(language, "settings.tables.form.save.create"),
    })
    .click()
  await page
    .getByRole("heading", {
      name: translate(language, "settings.tables.title"),
    })
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

/**
 * A local write made through the real domain action layer (e.g.
 * `markCashPaid`) or through one of the `window.__e2e*` bridges is
 * fire-and-forget from Evolu's own perspective — the write is queued
 * against the local SQLite database, and a hard navigation or a fresh page
 * load can otherwise race ahead of it actually landing and read a stale
 * snapshot. Give it a moment to settle before navigating away or reloading.
 * See `markCashPaidAndSettle` and `simulateCancelAfterClaim` for the two
 * call shapes this covers.
 */
export async function waitForLocalWriteToSettle(page: Page): Promise<void> {
  await page.waitForTimeout(1000)
}

/**
 * `markCashPaid`, then waits for that write to settle (see
 * `waitForLocalWriteToSettle`) before the caller navigates away or reloads —
 * a hard navigation right after `markCashPaid` can otherwise race ahead of
 * it and load a stale snapshot.
 */
export async function markCashPaidAndSettle(
  page: Page,
  language: Language
): Promise<void> {
  await markCashPaid(page, language)
  await waitForLocalWriteToSettle(page)
}

/**
 * Selects the Lightning/Spark tab on the payment-wait screen and waits for
 * the invoice to finish preparing (the QR code becomes renderable), so the
 * payment has an `lnInvoice`/`sparkInvoice` for `markSparkPaid` to match
 * against.
 */
export async function prepareSparkPayment(
  page: Page,
  language: Language
): Promise<void> {
  await page
    .getByRole("tab", {
      name: translate(language, "paymentWait.method.lightning"),
    })
    .click()
  // The button also contains a spinner `<svg>` (lucide's LoaderCircleIcon)
  // while preparing, so match the QR code's own class rather than any `svg`.
  await page
    .getByRole("button", { name: translate(language, "paymentWait.copyQr") })
    .locator("svg.size-full")
    .waitFor()
}

/** Reads the payment id off the current `/payment/$paymentId` URL. */
export function getPaymentIdFromUrl(page: Page): string {
  const paymentId = new URL(page.url()).pathname.split("/").pop()
  if (!paymentId) {
    throw new Error(`Could not determine payment id from URL ${page.url()}`)
  }
  return paymentId
}

/**
 * Simulates an incoming Spark transfer settling the current payment via
 * `window.__e2eMarkSparkPaid` (see src/components/e2e-test-bridge.tsx) —
 * there is no real counterparty to pay the Lightning invoice in a test run.
 */
export async function markSparkPaid(
  page: Page,
  language: Language
): Promise<void> {
  const paymentId = getPaymentIdFromUrl(page)

  await page.waitForFunction(
    () => typeof window.__e2eMarkSparkPaid === "function"
  )
  await page.evaluate((id) => window.__e2eMarkSparkPaid?.(id), paymentId)
  await page
    .getByTestId("payment-paid-panel")
    .getByText(translate(language, "paymentWait.paid"))
    .waitFor()
}

/**
 * Selects the IBAN tab on the payment-wait screen and waits for the bank QR
 * to finish preparing, so the payment has a `variableSymbol` for
 * `markIbanPaid` to match against.
 */
export async function prepareIbanPayment(
  page: Page,
  language: Language
): Promise<void> {
  await page
    .getByRole("tab", { name: translate(language, "paymentWait.method.iban") })
    .click()
  await page
    .getByRole("button", { name: translate(language, "paymentWait.copyQr") })
    .locator("svg.size-full")
    .waitFor()
}

/**
 * Simulates an incoming bank transaction settling the current IBAN payment
 * via `window.__e2eMarkIbanPaid` (see src/components/e2e-test-bridge.tsx) —
 * there is no real bank transfer in a test run.
 */
export async function markIbanPaid(
  page: Page,
  language: Language
): Promise<void> {
  const paymentId = getPaymentIdFromUrl(page)

  await page.waitForFunction(
    () => typeof window.__e2eMarkIbanPaid === "function"
  )
  await page.evaluate((id) => window.__e2eMarkIbanPaid?.(id), paymentId)
  await page
    .getByTestId("payment-paid-panel")
    .getByText(translate(language, "paymentWait.paid"))
    .waitFor()
}

/**
 * Simulates the CRDT merge race documented in docs/bill-payment-states.md
 * via `window.__e2eSimulateCancelAfterClaim` (see
 * src/components/e2e-test-bridge.tsx): cancels the current (already-claimed)
 * payment directly, bypassing `cancelPayment`'s guard, so it ends up
 * canceled+claimed — the collision the payment-detail/payment-history UI
 * surfaces via `confirmPaymentPaidDespiteCancellation`. Assumes the page is
 * still on the `/payment/$paymentId` URL for that payment (e.g. right after
 * `markCashPaid`).
 */
export async function simulateCancelAfterClaim(
  page: Page,
  language: Language
): Promise<void> {
  const paymentId = getPaymentIdFromUrl(page)

  await page.waitForFunction(
    () => typeof window.__e2eSimulateCancelAfterClaim === "function"
  )
  await page.evaluate(
    (id) => window.__e2eSimulateCancelAfterClaim?.(id),
    paymentId
  )

  // Wait for this same page's own reactive query to reflect the
  // cancellation (it renders `paymentWait.canceled` once `canceledAt` is
  // non-null — see `_terminal.payment_.$paymentId.tsx`) before letting the
  // caller navigate away — a full-page navigation right after the bridge
  // call can otherwise race ahead of the in-memory update. Even then, a
  // hard navigation immediately afterward can still occasionally load a
  // snapshot from just before local storage caught up (unlike every other
  // mutation in this file, `simulateCancelAfterClaim` goes through
  // `evolu.update` directly rather than a real domain action, so this is
  // the only place that races a fresh page load this closely) — the extra
  // wait below gives that a moment to settle.
  await page.getByText(translate(language, "paymentWait.canceled")).waitFor()
  await waitForLocalWriteToSettle(page)
}

/**
 * Simulates a second offline device independently settling the current
 * (already cash-claimed) payment through its other prepared method — IBAN —
 * via `window.__e2eSimulateDuplicateSettlement` (see
 * src/components/e2e-test-bridge.tsx). Produces the duplicate-settlement
 * collision: the payment ends up claimed for more than its own amount.
 * Assumes the page is still on the `/payment/$paymentId` URL for that
 * payment (e.g. right after `markCashPaid`), and that the payment was
 * created with `createPayment` (which prepares both cash and IBAN).
 */
export async function simulateDuplicateSettlement(page: Page): Promise<void> {
  const paymentId = getPaymentIdFromUrl(page)

  await page.waitForFunction(
    () => typeof window.__e2eSimulateDuplicateSettlement === "function"
  )
  await page.evaluate(
    (id) => window.__e2eSimulateDuplicateSettlement?.(id),
    paymentId
  )
}

/**
 * Simulates another, still-offline device editing `billId`'s line items
 * while a payment against it is in flight, via
 * `window.__e2eSimulateBillModifiedDuringPayment` (see
 * src/components/e2e-test-bridge.tsx) — bypasses `requireEditableBill`'s
 * lock, which only prevents this on the *same* device the pending payment
 * is visible on. `mode: "add"` grows the bill's total past the payment's
 * already-fixed amount (underpaid once claimed); `mode: "removeAll"`
 * shrinks it below (overpaid once claimed). See
 * docs/bill-payment-states.md's "Bill payment coverage" section.
 */
export async function simulateBillModifiedDuringPayment(
  page: Page,
  billId: string,
  mode: "add" | "removeAll"
): Promise<void> {
  await page.waitForFunction(
    () => typeof window.__e2eSimulateBillModifiedDuringPayment === "function"
  )
  await page.evaluate(
    ({ id, mode: pickedMode }) =>
      window.__e2eSimulateBillModifiedDuringPayment?.(id, pickedMode),
    { id: billId, mode }
  )
}

/**
 * Creates and pays a *second*, independent payment for `billId` via
 * `window.__e2eCreateAndPaySecondPayment` (see
 * src/components/e2e-test-bridge.tsx) — the real `createPayment`/
 * `markPaymentPaidCash` actions, not a bypass. Split payments are an
 * intended capability, but the bill page's own "Charge" button disappears
 * once the bill's derived status is no longer `open` (e.g. once a first
 * payment already fully covers it), so this is the only way to reach "two
 * paid payments on one bill" without two real devices. Produces a genuine
 * overpaid bill once both are claimed.
 */
export async function createAndPaySecondPayment(
  page: Page,
  billId: string
): Promise<void> {
  await page.waitForFunction(
    () => typeof window.__e2eCreateAndPaySecondPayment === "function"
  )
  await page.evaluate(
    (id) => window.__e2eCreateAndPaySecondPayment?.(id),
    billId
  )
}

/**
 * Cancels `billId` directly via `window.__e2eCancelBill` (see
 * src/components/e2e-test-bridge.tsx) — the real `cancelBill` action,
 * called directly because the bill page's own UI hides the cart's discard
 * button while a payment is pending, making this transition (allowed by the
 * domain guard, not by the UI) hard to trigger by clicking through. Unlike
 * `simulateCancelAfterClaim`, this goes through the real action (the same
 * one `runMutationWithCompletion`-backed path a UI click would use), so it
 * doesn't need the extra settle time that bypassing the guard does.
 */
export async function cancelBillDirectly(
  page: Page,
  billId: string
): Promise<void> {
  await page.waitForFunction(() => typeof window.__e2eCancelBill === "function")
  await page.evaluate((id) => window.__e2eCancelBill?.(id), billId)
}
