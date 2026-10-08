import { describe, expect, test } from "vitest"

import { isRouteAllowedForStation } from "./station-route-access.ts"

describe("isRouteAllowedForStation", () => {
  test.each([
    "/_terminal/",
    "/_terminal/payment/tip",
    "/_terminal/payment_/$paymentId",
    "/_terminal/activity",
    "/_terminal/activity_/$paymentId",
    "/_terminal/settings/",
    "/_terminal/settings/language",
    "/_terminal/settings/theme",
    "/_terminal/settings/about/",
    "/_terminal/settings/about/privacy",
    "/_terminal/settings/about/terms",
  ] as const)("lets a station open %s", (routeId) => {
    expect(isRouteAllowedForStation(routeId)).toBe(true)
  })

  test.each([
    "/_terminal/bill",
    "/_terminal/activity_/bills",
    "/_terminal/activity_/bills_/$billId",
    "/_terminal/activity_/stations",
    "/_terminal/settings/accounts",
    "/_terminal/settings/security",
    "/_terminal/settings/payment-accounts/",
    "/_terminal/settings/payment-accounts/iban/",
    "/_terminal/settings/payment-accounts/spark/withdraw",
    "/_terminal/settings/tips",
    "/_terminal/settings/items/",
    "/_terminal/settings/stations/",
    "/_terminal/settings/employees",
    "/_terminal/settings/home-screen",
    "/_terminal/settings/eet",
    "/_terminal/settings/support",
    "/_terminal/settings/debug-console",
    "/_terminal/settings/evolu-export",
  ] as const)("keeps a station out of the owner's %s", (routeId) => {
    expect(isRouteAllowedForStation(routeId)).toBe(false)
  })
})
