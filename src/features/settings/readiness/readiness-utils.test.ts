import { describe, expect, it } from "vitest"

import { createReadinessItems } from "./readiness-utils.ts"

const baseInput = {
  hasRecoveryPhrase: true,
  hasActiveSyncTransport: true,
  hasActiveSparkAccount: true,
  hasActiveCashRegisterAccount: false,
  hasActiveFiatBankAccount: true,
  hasDefaultPaymentMethod: true,
  isDefaultPaymentMethodAvailable: true,
  hasActiveFioPlugin: true,
  hasActiveFioPluginToken: true,
}

describe("createReadinessItems", () => {
  it("marks the setup checklist complete when required state is ready", () => {
    const items = createReadinessItems(baseInput)

    expect(items).toEqual([
      expect.objectContaining({ id: "recoveryPhrase", completed: true }),
      expect.objectContaining({ id: "sync", completed: true }),
      expect.objectContaining({ id: "paymentMethods", completed: true }),
      expect.objectContaining({ id: "defaultPaymentMethod", completed: true }),
      expect.objectContaining({ id: "bankAccount", completed: true }),
      expect.objectContaining({ id: "fioPlugin", completed: true }),
    ])
  })

  it("marks missing setup as incomplete and points to the relevant settings screens", () => {
    const items = createReadinessItems({
      ...baseInput,
      hasActiveSyncTransport: false,
      hasActiveSparkAccount: false,
      hasActiveFiatBankAccount: false,
      hasDefaultPaymentMethod: false,
      isDefaultPaymentMethodAvailable: false,
      hasActiveFioPlugin: false,
      hasActiveFioPluginToken: false,
    })

    expect(items).toEqual([
      expect.objectContaining({
        id: "recoveryPhrase",
        completed: true,
        actionTo: "/settings/security",
      }),
      expect.objectContaining({
        id: "sync",
        completed: false,
        actionTo: "/settings/security",
      }),
      expect.objectContaining({
        id: "paymentMethods",
        completed: false,
        actionTo: "/settings/payment-accounts",
      }),
      expect.objectContaining({
        id: "defaultPaymentMethod",
        completed: false,
        actionTo: "/settings/default-payment-method",
      }),
      expect.objectContaining({
        id: "bankAccount",
        completed: false,
        actionTo: "/settings/payment-accounts",
      }),
      expect.objectContaining({
        id: "fioPlugin",
        completed: true,
        actionTo: "/settings/fio-plugin",
      }),
    ])
  })

  it("marks Fio incomplete when bank payments are active without an active plugin", () => {
    const items = createReadinessItems({
      ...baseInput,
      hasActiveFioPlugin: false,
    })

    expect(items.find((item) => item.id === "fioPlugin")?.completed).toBe(false)
  })

  it("marks Fio incomplete when bank payments are active with an active plugin but no token", () => {
    const items = createReadinessItems({
      ...baseInput,
      hasActiveFioPluginToken: false,
    })

    expect(items.find((item) => item.id === "fioPlugin")?.completed).toBe(false)
  })

  it("marks Fio complete when bank payments are inactive even without a plugin token", () => {
    const items = createReadinessItems({
      ...baseInput,
      hasActiveFiatBankAccount: false,
      hasActiveFioPlugin: false,
      hasActiveFioPluginToken: false,
    })

    expect(items.find((item) => item.id === "fioPlugin")?.completed).toBe(true)
  })

  it("accepts any active payment method and only requires Fio for bank payments", () => {
    const items = createReadinessItems({
      ...baseInput,
      hasActiveSparkAccount: false,
      hasActiveCashRegisterAccount: true,
      hasActiveFiatBankAccount: false,
      hasActiveFioPlugin: false,
      hasActiveFioPluginToken: false,
    })

    expect(items.find((item) => item.id === "paymentMethods")?.completed).toBe(
      true
    )
    expect(items.find((item) => item.id === "bankAccount")?.completed).toBe(
      false
    )
    expect(items.find((item) => item.id === "fioPlugin")?.completed).toBe(true)
  })
})
