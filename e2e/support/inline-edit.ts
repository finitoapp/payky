import type { Locator, Page } from "@playwright/test"

import type { TranslationKey } from "../../src/i18n/resources.ts"
import { translate } from "./i18n.ts"

/**
 * Helpers for the settings edit forms, where every field saves itself
 * instead of a form-wide submit button. Each one waits for the saved tick,
 * so the caller can navigate away knowing the write landed.
 *
 * Runner-agnostic, like `i18n.ts`: no `test.step(...)` in here.
 */

/**
 * The tick belonging to one control. It has to be scoped to the control's
 * own field: the tick stays up for over a second, so two fields saved back
 * to back have two of them on screen at once.
 */
const savedTickFor = (page: Page, control: Locator): Locator =>
  page
    .locator('[data-slot="field"]')
    .filter({ has: control })
    .getByRole("status")

/**
 * Types into an inline-edit field and confirms it with `Enter`. The value
 * has to differ from the stored one — an unchanged field saves nothing and
 * never shows the tick this waits for.
 */
export async function fillInlineField(
  page: Page,
  input: Locator,
  value: string
): Promise<void> {
  await input.fill(value)
  await input.press("Enter")
  await savedTickFor(page, input).waitFor()
}

/**
 * Picks an option in an inline-edit select, which saves straight away. As
 * with `fillInlineField`, picking the option already selected saves nothing.
 */
export async function pickInlineOption(
  page: Page,
  selectLabelKey: TranslationKey,
  optionName: string | RegExp
): Promise<void> {
  const trigger = page.getByRole("combobox", {
    name: translate("en", selectLabelKey),
  })

  await trigger.click()
  await page.getByRole("option", { name: optionName }).click()
  await savedTickFor(page, trigger).waitFor()
}
