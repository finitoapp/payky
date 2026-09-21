import { describe, expect, test } from "vitest"

import {
  getOnboardingSteps,
  initialOnboardingStep,
} from "@/features/onboarding/onboarding-form-state.ts"

describe("getOnboardingSteps", () => {
  test("a new account only answers the bank account question", () => {
    expect(
      getOnboardingSteps({ accountType: "new", restoredAccountSetup: false })
    ).toEqual(["start", "payments"])
    expect(
      getOnboardingSteps({ accountType: null, restoredAccountSetup: false })
    ).toEqual(["start", "payments"])
  })

  test("restoring goes from the start screen to the recovery phrase", () => {
    expect(
      getOnboardingSteps({
        accountType: "restore",
        restoredAccountSetup: false,
      })
    ).toEqual(["start", "restore"])
  })

  test("a restored account without Payky data is asked for its bank account only", () => {
    expect(
      getOnboardingSteps({
        accountType: "restore",
        restoredAccountSetup: true,
      })
    ).toEqual(["payments"])
    expect(initialOnboardingStep(true)).toBe("payments")
    expect(initialOnboardingStep(false)).toBe("start")
  })
})
