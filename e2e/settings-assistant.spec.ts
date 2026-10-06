import { mockAssistantProxy } from "./support/assistant-mocks.ts"
import { expect, test } from "./support/fixtures.ts"
import { translate } from "./support/i18n.ts"
import { gotoPage } from "./support/navigation.ts"

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
})

test("retries a question the assistant could not answer", async ({
  seededPage: page,
}) => {
  await mockAssistantProxy(page, [
    // A 400, because the AI SDK retries a 5xx itself.
    { status: 400 },
    { text: "Now it works." },
  ])

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
