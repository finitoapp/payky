import type { Page } from "@playwright/test"
import type { TranslationKey } from "../src/i18n/resources.ts"
import { addCatalogItem } from "./support/bill.ts"
import { createAndPaySecondPayment } from "./support/collisions.ts"
import {
  createEetCertificateFile,
  enableEetWithGeneratedCertificate,
  type FakeEet,
  routeFakeEet,
  selectEetSandbox,
} from "./support/eet.ts"
import { expect, test } from "./support/fixtures.ts"
import { nameParam, translate, translateValue } from "./support/i18n.ts"
import { pickInlineToggle, toggleInlineSwitch } from "./support/inline-edit.ts"
import { gotoPage, waitForLocalWriteToSettle } from "./support/navigation.ts"
import { seedOnboarding } from "./support/onboarding.ts"
import {
  createPayment,
  enterAmount,
  enterCashReceived,
  getPaymentIdFromUrl,
  markCashPaid,
  markCashPaidAndSettle,
  startBillAndBeginCashPayment,
} from "./support/payment.ts"

const eetStatusOf = (page: Page) => page.getByTestId("eet-sale-status")

const eetDeliveryTimeout = { timeout: 20_000 }

async function takeCashPayment(page: Page, amount?: string): Promise<string> {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await createPayment(page, "en", amount)
  await page
    .getByRole("tab", { name: translate("en", "paymentWait.method.cash") })
    .click()
  const paymentId = getPaymentIdFromUrl(page)
  await markCashPaidAndSettle(page, "en")
  return paymentId
}

const lastReportedAmount = () =>
  fakeEet.production.requests.at(-1)?.data.celk_trzba

async function openPaymentDetail(page: Page, paymentId: string): Promise<void> {
  await gotoPage(page, `/activity/${paymentId}`, "en", "paymentDetail.title")
}

let fakeEet: FakeEet

test.beforeEach(async ({ page }) => {
  fakeEet = await routeFakeEet(page)
  await seedOnboarding(page, "en", { fiatCurrency: "CZK" })
})

test("EET starts off and turns on after a certificate and an establishment number", async ({
  page,
}) => {
  await test.step("the settings list always offers EET, switched off", async () => {
    await gotoPage(page, "/settings", "en", "settings.title")
    const entry = page.getByRole("link", {
      name: new RegExp(translate("en", "settings.eet.title")),
    })
    await expect(entry).toContainText(translate("en", "settings.eet.nav.off"))
    await entry.click()
    await page
      .getByRole("heading", { name: translate("en", "settings.eet.title") })
      .waitFor()
  })

  await test.step("the switch stays disabled and names what is missing", async () => {
    await expect(
      page.getByRole("switch", {
        name: translate("en", "settings.eet.enabled.label"),
      })
    ).toBeDisabled()
    await expect(
      page.getByText(
        translate("en", "settings.eet.enabled.missing").replace(
          "{missing}",
          [
            translate("en", "settings.eet.gap.certificate"),
            translate("en", "settings.eet.gap.establishment"),
          ].join(", ")
        )
      )
    ).toBeVisible()
  })

  await test.step("a generated certificate imports and EET turns on", async () => {
    await enableEetWithGeneratedCertificate(page, "en")
    await expect(
      page.getByRole("switch", {
        name: translate("en", "settings.eet.enabled.label"),
      })
    ).toBeChecked()
  })

  await test.step("the settings list shows EET on", async () => {
    await gotoPage(page, "/settings", "en", "settings.title")
    await expect(
      page.getByRole("link", {
        name: new RegExp(translate("en", "settings.eet.title")),
      })
    ).toContainText(translate("en", "settings.eet.nav.production"))
  })
})

test("a wrong certificate password is refused", async ({ page }) => {
  await gotoPage(page, "/settings/eet", "en", "settings.eet.title")
  await page
    .getByLabel(translate("en", "settings.eet.certificate.file.label"))
    .setInputFiles({
      ...(await createEetCertificateFile()),
      mimeType: "application/x-pkcs12",
    })
  await page
    .getByLabel(translate("en", "settings.eet.certificate.password.label"))
    .fill("not-the-password")
  await page
    .getByRole("button", {
      name: translate("en", "settings.eet.certificate.import"),
    })
    .click()

  await expect(
    page.getByText(
      translate("en", "settings.eet.certificate.error.wrongPassword")
    )
  ).toBeVisible()
  await expect(
    page.getByText(translate("en", "settings.eet.certificate.none"))
  ).toBeVisible()
})

test("the sandbox asks first, warns on every terminal screen, and marks the paid screen", async ({
  page,
}) => {
  test.slow()

  await test.step("production shows no sandbox warning", async () => {
    await enableEetWithGeneratedCertificate(page, "en")
    await gotoPage(page, "/settings", "en", "settings.title")
    await expect(page.getByTestId("eet-sandbox-banner")).toHaveCount(0)
  })

  await test.step("canceling the confirmation keeps production", async () => {
    await gotoPage(page, "/settings/eet", "en", "settings.eet.title")
    await selectEetSandbox(page, "en", { confirm: false })
    await expect(page.getByTestId("eet-sandbox-banner")).toHaveCount(0)
    await expect(
      page.getByRole("button", {
        name: new RegExp(
          translate("en", "settings.eet.environment.production.title")
        ),
      })
    ).toHaveAttribute("aria-pressed", "true")
  })

  await test.step("confirming turns the sandbox on", async () => {
    await selectEetSandbox(page, "en", { confirm: true })
    await expect(page.getByTestId("eet-sandbox-banner")).toBeVisible()
  })

  await test.step("the warning is on home, activity, bill and settings", async () => {
    for (const [path, heading] of [
      ["/activity", "activity.title"],
      ["/settings", "settings.title"],
      ["/bill", "bill.title"],
    ] as const) {
      await gotoPage(page, path, "en", heading)
      await expect(page.getByTestId("eet-sandbox-banner")).toBeVisible()
    }
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("eet-sandbox-banner")).toBeVisible()
  })

  await test.step("the paid screen says the sale went to the test environment", async () => {
    await takeCashPayment(page)
    await expect(
      page
        .getByTestId("payment-paid-panel")
        .getByText(translate("en", "paymentWait.eetSandbox"))
    ).toBeVisible()
  })

  await test.step("tapping the warning opens the EET settings", async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await page.getByTestId("eet-sandbox-banner").click()
    await page
      .getByRole("heading", { name: translate("en", "settings.eet.title") })
      .waitFor()
  })
})

test("the connection test and the test sale show EET's answer and record nothing", async ({
  page,
}) => {
  await enableEetWithGeneratedCertificate(page, "en")
  await selectEetSandbox(page, "en", { confirm: true })

  await test.step("the connection test passes in verification mode", async () => {
    await page
      .getByRole("button", {
        name: translate("en", "settings.eet.test.connection"),
      })
      .click()
    const result = page.getByTestId("eet-test-result")
    await expect(result).toContainText(
      translate("en", "settings.eet.test.outcome.verified")
    )
    expect(fakeEet.playground.requests.at(-1)?.header.overeni).toBe("true")
  })

  await test.step("the test sale returns a test POK and both raw messages", async () => {
    await page
      .getByRole("button", { name: translate("en", "settings.eet.test.sale") })
      .click()
    await expect(page.getByTestId("eet-test-pok")).toContainText(/-ff$/u)
    const result = page.getByTestId("eet-test-result")
    await result
      .getByRole("button", {
        name: translate("en", "settings.eet.test.rawRequest"),
      })
      .click()
    await expect(result.locator("pre").first()).toContainText("<tns:Trzba")
    await result
      .getByRole("button", {
        name: translate("en", "settings.eet.test.rawResponse"),
      })
      .click()
    await expect(result.locator("pre").last()).toContainText("Potvrzeni")
  })

  await test.step("no sale record was created", async () => {
    await expect(
      page.getByText(translate("en", "settings.eet.unconfirmed.empty"))
    ).toBeVisible()
    await gotoPage(page, "/activity", "en", "activity.title")
    await expect(page.locator("nav").getByRole("link")).toHaveCount(0)
  })
})

test("the official test certificate is picked in one step in the sandbox", async ({
  page,
}) => {
  const officialCertificate = await createEetCertificateFile("CZ9876543210")
  await page.route("**/api/eet/playground-certificates", async (route) => {
    await route.fulfill({
      json: {
        password: "generated-e2e-password",
        certificates: [
          {
            fileName: officialCertificate.name,
            p12Base64: officialCertificate.buffer.toString("base64"),
          },
        ],
      },
      headers: { "access-control-allow-origin": "*" },
    })
  })

  await gotoPage(page, "/settings/eet", "en", "settings.eet.title")
  await expect(
    page.getByRole("button", {
      name: translate("en", "settings.eet.officialTest.show"),
    })
  ).toHaveCount(0)
  await selectEetSandbox(page, "en", { confirm: true })

  await test.step("the downloaded certificates are listed with EIČ and description", async () => {
    await page
      .getByRole("button", {
        name: translate("en", "settings.eet.officialTest.show"),
      })
      .click()
    await expect(page.getByText("CZ9876543210")).toBeVisible()
    await expect(page.getByText("generated e2e taxpayer")).toBeVisible()
  })

  await test.step("picking one stores it as a test certificate", async () => {
    await page
      .getByRole("button", {
        name: nameParam("settings.eet.officialTest.use", "CZ9876543210"),
      })
      .click()
    await expect(page.getByTestId("eet-certificate-eic")).toHaveText(
      "CZ9876543210"
    )
    await expect(
      page.getByText(translate("en", "settings.eet.certificate.testBadge"), {
        exact: true,
      })
    ).toBeVisible()
  })

  await test.step("production cannot be selected with a test certificate", async () => {
    await page
      .getByRole("button", {
        name: new RegExp(
          translate("en", "settings.eet.environment.production.title")
        ),
      })
      .click()
    await expect(
      page
        .getByRole("button", {
          name: new RegExp(
            translate("en", "settings.eet.environment.playground.title")
          ),
        })
        .first()
    ).toHaveAttribute("aria-pressed", "true")
  })
})

test("the official test certificates fall back to the file import when unavailable", async ({
  page,
}) => {
  await page.route("**/api/eet/playground-certificates", async (route) => {
    await route.fulfill({
      status: 502,
      json: { status: "ERROR", reason: "unavailable" },
      headers: { "access-control-allow-origin": "*" },
    })
  })
  await gotoPage(page, "/settings/eet", "en", "settings.eet.title")
  await selectEetSandbox(page, "en", { confirm: true })

  await page
    .getByRole("button", {
      name: translate("en", "settings.eet.officialTest.show"),
    })
    .click()

  await expect(
    page.getByText(
      translate("en", "settings.eet.officialTest.unavailable.title")
    )
  ).toBeVisible()
  await expect(
    page.getByLabel(translate("en", "settings.eet.certificate.file.label"))
  ).toBeVisible()
  await expect(
    page.getByText(translate("en", "settings.eet.certificate.none"))
  ).toBeVisible()
})

test("the payment detail shows a confirmed sale and lets staff resend a pending one", async ({
  page,
}) => {
  test.slow()

  await enableEetWithGeneratedCertificate(page, "en")

  await test.step("a cash payment is confirmed by EET", async () => {
    const paymentId = await takeCashPayment(page)
    await openPaymentDetail(page, paymentId)
    const eet = page.getByTestId("payment-detail-eet")
    await expect(eetStatusOf(page)).toHaveText(
      translate("en", "eet.status.confirmed"),
      eetDeliveryTimeout
    )
    await expect(eet).toContainText(translate("en", "paymentDetail.eet.pok"))
    await expect(eet).toContainText(
      translate("en", "paymentDetail.eet.receivedAt")
    )
  })

  await test.step("a payment EET could not be reached for stays pending", async () => {
    fakeEet.setUnreachable(true)
    const paymentId = await takeCashPayment(page)
    await openPaymentDetail(page, paymentId)
    await expect(eetStatusOf(page)).toHaveText(
      translate("en", "eet.status.pending")
    )
  })

  await test.step("staff resends it and EET confirms it", async () => {
    fakeEet.setUnreachable(false)
    await page
      .getByRole("button", { name: translate("en", "paymentDetail.eet.retry") })
      .click()
    await expect(eetStatusOf(page)).toHaveText(
      translate("en", "eet.status.confirmed"),
      eetDeliveryTimeout
    )
    await expect(
      page.getByRole("button", {
        name: translate("en", "paymentDetail.eet.retry"),
      })
    ).toHaveCount(0)
  })
})

test("the bill detail shows the EET status of each payment", async ({
  page,
}) => {
  test.slow()

  await enableEetWithGeneratedCertificate(page, "en")
  await addCatalogItem(page, "en", { name: "Coffee", price: "50" })

  await test.step("one payment is rejected and the other confirmed", async () => {
    fakeEet.production.answerNext({
      type: "error",
      code: 4,
      message: "Neplatny podpis SOAP zpravy",
    })
    const billId = await startBillAndBeginCashPayment(page, "en")
    await createAndPaySecondPayment(page, billId)
    await markCashPaid(page, "en")
    await expect
      .poll(() => fakeEet.production.requests.length, eetDeliveryTimeout)
      .toBe(2)
    await waitForLocalWriteToSettle(page)

    await gotoPage(page, `/activity/bills/${billId}`, "en", "billDetail.title")
  })

  await test.step("each payment row carries its own EET status", async () => {
    const statuses = eetStatusOf(page)
    await expect(statuses).toHaveCount(2, eetDeliveryTimeout)
    await expect(
      statuses.filter({ hasText: translate("en", "eet.status.confirmed") })
    ).toHaveCount(1)
    await expect(
      statuses.filter({ hasText: translate("en", "eet.status.rejected") })
    ).toHaveCount(1)
  })
})

test("the paid screen appears at once while EET cannot be reached", async ({
  page,
}) => {
  await enableEetWithGeneratedCertificate(page, "en")
  fakeEet.setUnreachable(true)

  await page.goto("/", { waitUntil: "domcontentloaded" })
  await createPayment(page, "en")
  await page
    .getByRole("tab", { name: translate("en", "paymentWait.method.cash") })
    .click()
  await page
    .getByRole("button", {
      name: translate("en", "paymentWait.cashPaid.action"),
    })
    .click()

  await expect(
    page
      .getByTestId("payment-paid-panel")
      .getByText(translate("en", "paymentWait.paid"))
  ).toBeVisible({ timeout: 2_000 })
})

test("tips that belong to employees are left out of the reported sale", async ({
  page,
}) => {
  const tipOption = (key: TranslationKey) =>
    page.getByRole("button", { name: new RegExp(translate("en", key)) })

  await enableEetWithGeneratedCertificate(page, "en")

  await test.step("tips belong to the business until the merchant says otherwise", async () => {
    await expect(
      page.getByText(translate("en", "settings.eet.tip.description"))
    ).toBeVisible()
    await expect(
      page.getByText(translate("en", "settings.eet.tip.note"))
    ).toBeVisible()
    await expect(tipOption("settings.eet.tip.business.title")).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  await test.step("the merchant says tips belong to employees", async () => {
    await pickInlineToggle(
      page,
      new RegExp(translate("en", "settings.eet.tip.employees.title"))
    )
    await waitForLocalWriteToSettle(page)
  })

  await test.step("a payment with a 10% tip is reported without the tip", async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await enterAmount(page, "en")
    await page
      .getByRole("button", { name: translate("en", "home.pay") })
      .click()
    await page
      .getByRole("button", {
        name: translateValue("en", "settings.tips.percentages.value", 10),
      })
      .click()
    await page
      .getByRole("tab", { name: translate("en", "paymentWait.method.cash") })
      .click()
    await enterCashReceived(page, "en", "6.49")
    await markCashPaidAndSettle(page, "en")

    await expect.poll(lastReportedAmount, eetDeliveryTimeout).toBe("5.90")
  })
})

test("a cash sale is reported as the cash received", async ({ page }) => {
  test.slow()

  await enableEetWithGeneratedCertificate(page, "en")

  await test.step("78.90 confirmed as prefilled is reported rounded to 79.00", async () => {
    await takeCashPayment(page, "78.9")
    await expect.poll(lastReportedAmount, eetDeliveryTimeout).toBe("79.00")
  })

  await test.step("78.90 with the change left is reported as 80.00", async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await createPayment(page, "en", "78.9")
    await page
      .getByRole("tab", { name: translate("en", "paymentWait.method.cash") })
      .click()
    const paymentId = getPaymentIdFromUrl(page)
    await enterCashReceived(page, "en", "77")
    await expect(
      page.getByRole("button", {
        name: translate("en", "paymentWait.cashPaid.action"),
      })
    ).toBeDisabled()
    await enterCashReceived(page, "en", "80")
    await expect(
      page.getByText(
        translate("en", "paymentWait.cashPaid.difference").replace(
          "{amount}",
          "CZK 1.10"
        )
      )
    ).toBeVisible()
    await markCashPaidAndSettle(page, "en")
    await expect.poll(lastReportedAmount, eetDeliveryTimeout).toBe("80.00")

    await openPaymentDetail(page, paymentId)
    await expect(
      page.getByText(
        translate("en", "paymentDetail.cashReceived").replace(
          "{amount}",
          "CZK 80.00"
        )
      )
    ).toBeVisible()
  })
})

test("EET can be switched off again", async ({ page }) => {
  await enableEetWithGeneratedCertificate(page, "en")

  await toggleInlineSwitch(page, "settings.eet.enabled.label")

  await expect(
    page.getByRole("switch", {
      name: translate("en", "settings.eet.enabled.label"),
    })
  ).not.toBeChecked()
})
