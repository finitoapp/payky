import { describe, expect, test } from "vitest"

import {
  getOnboardingSteps,
  initialOnboardingStep,
} from "@/features/onboarding/onboarding-form-state.ts"

describe("getOnboardingSteps", () => {
  test("includes the setup steps for a new account", () => {
    expect(
      getOnboardingSteps({ accountType: "new", restoredAccountSetup: false })
    ).toEqual([
      "language",
      "accountChoice",
      "country",
      "currency",
      "payments",
      "account",
    ])
  })

  test("goes directly from account choice to recovery for restoration", () => {
    expect(
      getOnboardingSteps({
        accountType: "restore",
        restoredAccountSetup: false,
      })
    ).toEqual(["language", "accountChoice", "restore"])
  })

  test("configures a restored account without choosing or confirming one", () => {
    expect(
      getOnboardingSteps({
        accountType: "restore",
        restoredAccountSetup: true,
      })
    ).toEqual(["country", "currency", "payments"])
    expect(initialOnboardingStep(true)).toBe("country")
    expect(initialOnboardingStep(false)).toBe("language")
  })
})
