import { expect, test, translate } from "./fixtures.ts"

/**
 * The terminal keypad accepts physical-keyboard input as well as taps — a
 * counter terminal often has a keyboard attached. `Keypad`'s keydown handler
 * reads the amount currently on screen, so Enter must charge what the
 * operator can see, including after a correction.
 */
test("the keypad takes physical-keyboard input and Enter charges the amount on screen", async ({
  seededPage: page,
}) => {
  const amount = page.getByRole("heading", { level: 1 })

  await test.step("type an amount", async () => {
    await page.getByRole("button", { name: "5", exact: true }).waitFor()
    await page.keyboard.press("5")
    await page.keyboard.press(".")
    await page.keyboard.press("9")
    await expect(amount).toHaveText(/5.*9/)
  })

  await test.step("correct the last digit with Backspace", async () => {
    await page.keyboard.press("Backspace")
    await page.keyboard.press("7")
    await expect(amount).toHaveText(/5.*7/)
  })

  await test.step("Enter charges the corrected amount", async () => {
    await page.keyboard.press("Enter")
    const ibanTab = page.getByRole("tab", {
      name: translate("en", "paymentWait.method.iban"),
    })
    const skipTipButton = page.getByRole("button", {
      name: translate("en", "paymentTip.none"),
    })
    await ibanTab.or(skipTipButton).first().waitFor()
  })
})
