import { describe, expect, test } from "vitest"
import { scanPermissionView, shouldAcceptScan } from "./scan-state.ts"

describe("scanPermissionView", () => {
  test("maps every permission state", () => {
    expect(scanPermissionView(null)).toBe("checking")
    expect(scanPermissionView({ granted: true, canAskAgain: true })).toBe(
      "granted"
    )
    expect(scanPermissionView({ granted: false, canAskAgain: true })).toBe(
      "request"
    )
    expect(scanPermissionView({ granted: false, canAskAgain: false })).toBe(
      "open-settings"
    )
  })
})

describe("shouldAcceptScan", () => {
  const last = { value: "a", at: 1000 }
  test("rejects the same value inside the window", () => {
    expect(shouldAcceptScan(last, "a", 2500, 2000)).toBe(false)
  })
  test("accepts it after the window, or a different value at once", () => {
    expect(shouldAcceptScan(last, "a", 3000, 2000)).toBe(true)
    expect(shouldAcceptScan(last, "b", 1001, 2000)).toBe(true)
    expect(shouldAcceptScan(null, "a", 0, 2000)).toBe(true)
  })
})
