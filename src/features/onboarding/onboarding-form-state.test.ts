import { describe, expect, test } from "vitest"

import { getOnboardingSteps } from "@/features/onboarding/onboarding-form-state.ts"

describe("getOnboardingSteps", () => {
  test("includes the setup steps for a new account", () => {
    expect(getOnboardingSteps("new")).toEqual([
      "language",
      "accountChoice",
      "currency",
      "payments",
      "account",
    ])
  })

  test("goes directly from account choice to recovery for restoration", () => {
    expect(getOnboardingSteps("restore")).toEqual([
      "language",
      "accountChoice",
      "restore",
    ])
  })
})
