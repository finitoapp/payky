import { expect, type Locator, type Page } from "@playwright/test"

import type { TranslationKey } from "../../src/i18n/resources.ts"
import { translate } from "./i18n.ts"

/**
 * Helpers for the settings edit forms, where every field saves itself
 * instead of a form-wide submit button. Each one waits for the write to
 * land — the saved tick where the control renders one, its own settled
 * state where it does not — so the caller can navigate away right after.
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

/**
 * Toggles an inline-edit checkbox, which saves straight away. As above, this
 * has to actually change the value to produce the tick it waits for.
 */
export async function toggleInlineCheckbox(
  page: Page,
  labelKey: TranslationKey
): Promise<void> {
  const checkbox = page.getByRole("checkbox", {
    name: translate("en", labelKey),
  })

  await checkbox.click()
  await savedTickFor(page, checkbox).waitFor()
}

/**
 * Toggles an inline-edit switch, which saves straight away. Unlike
 * `toggleInlineCheckbox`, a switch's underlying checkbox input is
 * `aria-hidden` (Base UI keeps it only for native form semantics), so this
 * targets the switch role instead.
 */
export async function toggleInlineSwitch(
  page: Page,
  labelKey: TranslationKey
): Promise<void> {
  const toggle = page.getByRole("switch", {
    name: translate("en", labelKey),
  })
  const wasChecked = await toggle.isChecked()

  await toggle.click()
  await expect(toggle).toBeChecked({ checked: !wasChecked })
  // Not the saved tick: a switch can be rendered with `showSaved={false}`
  // (both payment-accounts switches are), and then no tick ever appears.
  // `useInlineChoice` disables the control while the save is in flight and
  // re-enables it on the live Evolu row, so waiting for it to come back
  // enabled — still toggled — is the settle signal that holds either way.
  await expect(toggle).toBeEnabled()
}

/**
 * Picks an option in an inline-edit toggle group, which saves straight away.
 */
export async function pickInlineToggle(
  page: Page,
  optionName: string | RegExp
): Promise<void> {
  const option = page.getByRole("button", { name: optionName })

  await option.click()
  await savedTickFor(page, option).waitFor()
}

/**
 * Opens a collapsed "Advanced options" section so the inline-edit controls
 * inside it become interactable. Collapsed by default and unmounted while
 * closed (`Collapsible.Panel`'s `keepMounted` defaults to `false`), so this
 * has to run again after every reload. Scoped to the card by its title,
 * since every card's trigger shares the same "Advanced options" label.
 */
export async function expandAdvancedOptions(
  page: Page,
  cardTitleKey: TranslationKey,
  triggerLabelKey: TranslationKey
): Promise<void> {
  await page
    .locator('[data-slot="card"]')
    .filter({ hasText: translate("en", cardTitleKey) })
    .getByRole("button", { name: translate("en", triggerLabelKey) })
    .click()
}
