import type { Page } from "@playwright/test"
import { mockAssistantProxy } from "./support/assistant-mocks.ts"
import { expect, test } from "./support/fixtures.ts"
import { translate } from "./support/i18n.ts"
import { gotoPage } from "./support/navigation.ts"

/** Allows the assistant on this device in the privacy settings (ai/0004). */
async function allowAssistant(page: Page, access: "public" | "all") {
  await gotoPage(
    page,
    "/settings/about/privacy",
    "en",
    "settings.about.privacy.title"
  )
  await page
    .getByRole("button", {
      name: translate("en", `settings.privacy.aiAssistant.${access}.title`),
    })
    .click()
}

test("hides the assistant until the device allows it", async ({
  seededPage: page,
}) => {
  await test.step("the settings do not offer it", async () => {
    await gotoPage(page, "/settings", "en", "settings.title")
    await expect(
      page.getByRole("link", {
        name: translate("en", "settings.assistant.title"),
      })
    ).toHaveCount(0)
  })

  await test.step("its address leads to the privacy settings", async () => {
    await gotoPage(
      page,
      "/settings/assistant",
      "en",
      "settings.about.privacy.title"
    )
  })
})

test("answers from the documentation alone without the data tools", async ({
  seededPage: page,
}) => {
  const proxy = await mockAssistantProxy(page, [
    { text: "Open the payment and refund it." },
  ])

  await test.step("allow the documentation and code only", async () => {
    await allowAssistant(page, "public")
  })

  await test.step("ask how Payky works", async () => {
    await gotoPage(
      page,
      "/settings/assistant",
      "en",
      "settings.assistant.title"
    )
    await expect(
      page.getByRole("button", {
        name: translate("en", "settings.assistant.suggestion.openBills"),
      })
    ).toHaveCount(0)
    await page
      .getByRole("button", {
        name: translate("en", "settings.assistant.suggestion.howRefund"),
      })
      .click()
    await expect(
      page.getByText("Open the payment and refund it.")
    ).toBeVisible()
    expect(proxy.requests[0]?.toolNames.toSorted()).toEqual([
      "listFiles",
      "readFile",
      "searchCode",
    ])
  })
})

test("asks the assistant and keeps the conversation", async ({
  seededPage: page,
}) => {
  const proxy = await mockAssistantProxy(page, [
    { text: "No bill is open." },
    { text: "You have no payments yet." },
  ])
  const question = translate("en", "settings.assistant.suggestion.openBills")

  const openAssistant = async () => {
    await page
      .getByRole("link", { name: translate("en", "settings.assistant.title") })
      .click()
    await page
      .getByRole("heading", {
        name: translate("en", "settings.assistant.title"),
      })
      .waitFor()
  }

  await test.step("allow the assistant with my data", async () => {
    await allowAssistant(page, "all")
  })

  await test.step("ask a suggested question", async () => {
    // Opened from the settings, so going back stays in the app.
    await gotoPage(page, "/settings", "en", "settings.title")
    await openAssistant()
    await page.getByRole("button", { name: question }).click()
    await expect(page.getByText("No bill is open.")).toBeVisible()
    await expect(
      page.getByText(translate("en", "settings.assistant.stopped"))
    ).toHaveCount(0)
  })

  await test.step("ask a follow-up with the conversation so far", async () => {
    await page
      .getByRole("textbox", {
        name: translate("en", "settings.assistant.message.label"),
      })
      .fill("And payments?")
    await page
      .getByRole("button", { name: translate("en", "settings.assistant.send") })
      .click()
    await expect(page.getByText("You have no payments yet.")).toBeVisible()
    expect(proxy.requests[1]?.messages.map(({ role }) => role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ])
    expect(proxy.requests[0]?.authorization).toMatch(/^Bearer \S{22}$/u)
    expect(proxy.requests[0]?.toolNames).toContain("listOpenBills")
  })

  await test.step("find the conversation again after leaving the page", async () => {
    await page
      .getByRole("button", { name: translate("en", "nav.back") })
      .click()
    await page
      .getByRole("heading", { name: translate("en", "settings.title") })
      .waitFor()
    await openAssistant()
    await expect(page.getByText("You have no payments yet.")).toBeVisible()
  })
  await test.step("start afresh once the device allows less", async () => {
    // Within the app, since a reload forgets the conversation anyway.
    await page.goBack()
    for (const key of [
      "settings.about.title",
      "settings.about.privacy.title",
    ] as const) {
      // The name runs on with the description, as "AI assistant Ask about…".
      await page
        .getByRole("link", {
          name: new RegExp(`^${translate("en", key)}`, "u"),
        })
        .click()
      await page.getByRole("heading", { name: translate("en", key) }).waitFor()
    }
    await page
      .getByRole("button", {
        name: translate("en", "settings.privacy.aiAssistant.public.title"),
      })
      .click()
    await page.goBack()
    await page.goBack()
    await openAssistant()
    await expect(page.getByText("You have no payments yet.")).toHaveCount(0)
  })
})

test("retries a question the assistant could not answer", async ({
  seededPage: page,
}) => {
  await mockAssistantProxy(page, [
    // A 400, because the AI SDK retries a 5xx itself.
    { status: 400 },
    { text: "Now it works." },
  ])
  await test.step("allow the assistant with my data", async () => {
    await allowAssistant(page, "all")
  })

  await test.step("a failed answer offers a retry", async () => {
    await gotoPage(
      page,
      "/settings/assistant",
      "en",
      "settings.assistant.title"
    )
    await page
      .getByRole("button", {
        name: translate("en", "settings.assistant.suggestion.today"),
      })
      .click()
    await page
      .getByRole("button", {
        name: translate("en", "settings.assistant.failed"),
      })
      .click()
    await expect(page.getByText("Now it works.")).toBeVisible()
  })
})

test("starts a new conversation", async ({ seededPage: page }) => {
  await mockAssistantProxy(page, [{ text: "No bill is open." }])
  const question = translate("en", "settings.assistant.suggestion.openBills")
  await test.step("allow the assistant with my data", async () => {
    await allowAssistant(page, "all")
  })

  await test.step("ask a question", async () => {
    await gotoPage(
      page,
      "/settings/assistant",
      "en",
      "settings.assistant.title"
    )
    await page.getByRole("button", { name: question }).click()
    await expect(page.getByText("No bill is open.")).toBeVisible()
  })

  await test.step("start over with the suggestions again", async () => {
    await page
      .getByRole("button", {
        name: translate("en", "settings.assistant.newConversation"),
      })
      .click()
    await expect(page.getByText("No bill is open.")).toHaveCount(0)
    await expect(page.getByRole("button", { name: question })).toBeVisible()
    await expect(
      page.getByRole("button", {
        name: translate("en", "settings.assistant.newConversation"),
      })
    ).toHaveCount(0)
  })
})
