import { describe, expect, test } from "vitest"

import { getOnboardingSteps } from "./onboarding-form-state.ts"

describe("getOnboardingSteps", () => {
  test("includes the setup steps for a new account", () => {
    expect(getOnboardingSteps("new")).toEqual(["accountChoice", "payments"])
  })

  test("goes directly from account choice to recovery for restoration", () => {
    expect(getOnboardingSteps("restore")).toEqual(["accountChoice", "restore"])
  })

  test("skips the choice step for an already restored phrase", () => {
    expect(getOnboardingSteps("existingMnemonic")).toEqual(["payments"])
  })
})
