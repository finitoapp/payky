import { test as base, expect, type Page } from "@playwright/test"

import { seedOnboarding } from "./onboarding.ts"

/**
 * Playwright's own artifact directory (already git-ignored — see
 * .gitignore's "Playwright" section) — screenshots taken explicitly by a
 * spec live alongside its auto-captured failure screenshots instead of a
 * new, separately-ignored directory.
 */
export const screenshotDir = "test-results/e2e-screenshots"

interface Fixtures {
  /**
   * A page already seeded through `seedOnboarding()` (English). Use this
   * instead of the default `page` fixture in specs that don't test
   * onboarding itself, to skip the manual seed step in every test.
   */
  readonly seededPage: Page
  /**
   * Whether `seededPage` leaves the recovery phrase unverified. Off by
   * default: the backup reminder would cover home after every first payment.
   */
  readonly unverifiedBackup: boolean
}

/** `test`/`expect` re-exported so specs only need one import source. */
export const test = base.extend<Fixtures>({
  unverifiedBackup: [false, { option: true }],
  seededPage: async ({ page, unverifiedBackup }, use) => {
    await seedOnboarding(page, "en", { unverifiedBackup })
    await use(page)
  },
})
export { expect }
