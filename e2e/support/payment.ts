import type { Page } from "@playwright/test"

import type { Language } from "../../src/i18n/resources.ts"
import { startBillWithCoffee } from "./bill.ts"
import { translate } from "./i18n.ts"
import { waitForLocalWriteToSettle } from "./navigation.ts"

/**
 * Runner-agnostic: `bin/generate-doc-screenshots.ts` imports these helpers
 * outside the Playwright test runner, so nothing here may call `test.step(...)`
 * — it throws "test.step() can only be called from a test" there.
 */
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
    await cashPaidButton.waitFor()
  }

  return billId
}
