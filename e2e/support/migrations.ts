import type { Page } from "@playwright/test"

/**
 * Runner-agnostic: nothing here may call `test.step(...)`, for the same
 * reason the other support modules may not (see `collisions.ts`).
 */

/**
 * Writes the row shape the versions before the Fio plugin became a singleton
 * left behind — a plugin at a generated id, with a token keyed to it — via
 * `window.__e2eSeedLegacyFioPlugin` (see src/components/e2e-test-bridge.tsx).
 *
 * That is what gives the migration runner something to do: its `hasWork`
 * check reads exactly these rows, so without them the next load finds nothing
 * pending and no popup ever appears.
 */
export async function seedLegacyFioPlugin(page: Page): Promise<void> {
  await page.waitForFunction(
    () => typeof window.__e2eSeedLegacyFioPlugin === "function"
  )
  await page.evaluate(() => window.__e2eSeedLegacyFioPlugin?.())
}

/**
 * Arms the `e2e-hold` migration for every subsequent load of this page.
 *
 * Real migrations are a handful of local Evolu writes and finish in
 * milliseconds, so the popup's running state cannot be caught by a screenshot
 * with any reliability. `appMigrations` therefore carries one extra entry
 * whose `hasWork` is this flag and whose `run` blocks until
 * `releaseMigrations` — in production its `hasWork` is always false, so it is
 * never pending and never runs. See `src/core/migrations/migrations.ts`.
 *
 * Uses `addInitScript`, so it has to be called *before* the load it should
 * affect, and it stays armed for every load after that.
 */
export async function holdMigrations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__e2eHoldMigrations = true
  })
}

/**
 * Disarms the hold for every *later* load. `addInitScript` re-runs on each
 * navigation, so without this the popup would reopen and block on every
 * subsequent page — and while it is open the rest of the app sits behind the
 * modal's `aria-hidden`, where `getByRole` cannot see it.
 */
export async function stopHoldingMigrations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__e2eHoldMigrations = false
  })
}

/** Lets the held `e2e-hold` migration finish, so the run can complete. */
export async function releaseMigrations(page: Page): Promise<void> {
  await page.waitForFunction(
    () => typeof window.__e2eReleaseMigrations === "function"
  )
  await page.evaluate(() => {
    window.__e2eReleaseMigrations?.()
  })
}
