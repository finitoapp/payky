import { readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { requiredPermission, routeAccess } from "./route-access.ts"

const appDir = join(import.meta.dirname, "../../app")

/** `app/pair.tsx` is `/pair`, `app/x/index.tsx` is `/x`, `[id]` is `:id`. */
const routeFiles = (readdirSync(appDir, { recursive: true }) as string[])
  .filter(
    (file) =>
      file.endsWith(".tsx") &&
      !file.split("/").some((part) => part.startsWith("+")) &&
      !file.endsWith("_layout.tsx")
  )
  .map((file) => {
    const path = `/${file
      .replace(/\.tsx$/, "")
      .replace(/(^|\/)index$/, "")
      .replace(/\[(\w+)\]/g, ":$1")}`
    return path
  })

describe("native route access", () => {
  it("has a table entry for every route file and no entry without one", () => {
    expect([...routeFiles].sort()).toEqual(Object.keys(routeAccess).sort())
  })

  it("treats an unknown path as owner-only", () => {
    expect(requiredPermission("/nope")).toBe("admin")
    expect(requiredPermission("/pair")).toBe("admin")
    expect(requiredPermission("/diagnostics")).toBe("admin")
    expect(requiredPermission("/")).toBe("sell")
    expect(requiredPermission("/bill")).toBe("sell")
    expect(requiredPermission("/onboarding")).toBeNull()
    expect(requiredPermission("/restore-account")).toBeNull()
  })

  it("matches a dynamic segment and prefers the static sibling", () => {
    expect(requiredPermission("/payment/tip")).toBe("sell")
    expect(requiredPermission("/payment/abc123")).toBe("sell")
    expect(requiredPermission("/payment/abc123/extra")).toBe("admin")
    expect(requiredPermission("/payment/")).toBe("admin")
    expect(requiredPermission("/activity")).toBe("activity")
    expect(requiredPermission("/activity/bills")).toBe("activity")
    expect(requiredPermission("/activity/abc123")).toBe("activity")
    expect(requiredPermission("/activity/bills/abc123")).toBe("activity")
    expect(requiredPermission("/withdraw")).toBe("admin")
    expect(requiredPermission("/withdraw/new")).toBe("admin")
    expect(requiredPermission("/withdraw/abc123")).toBe("admin")
    expect(requiredPermission("/cashu-withdraw")).toBe("admin")
    expect(requiredPermission("/cashu-withdraw/new")).toBe("admin")
    expect(requiredPermission("/cashu-withdraw/abc123")).toBe("admin")
    expect(requiredPermission("/settings")).toBeNull()
    expect(requiredPermission("/settings/about")).toBeNull()
    expect(requiredPermission("/settings/about/terms")).toBeNull()
    expect(requiredPermission("/settings/language")).toBeNull()
    expect(requiredPermission("/settings/theme")).toBeNull()
    expect(requiredPermission("/settings/home-screen")).toBe("settings")
    expect(requiredPermission("/settings/profile")).toBe("admin")
    expect(requiredPermission("/settings/security")).toBe("admin")
    expect(requiredPermission("/settings/evolu-export")).toBe("admin")
    expect(requiredPermission("/settings/legal-entity")).toBe("settings")
    expect(requiredPermission("/settings/tax-rates")).toBe("settings")
    expect(requiredPermission("/settings/tips")).toBe("settings")
    expect(requiredPermission("/settings/payment-number-series")).toBe(
      "settings"
    )
    expect(requiredPermission("/settings/items")).toBe("settings")
    expect(requiredPermission("/settings/items/new")).toBe("settings")
    expect(requiredPermission("/settings/items/abc123")).toBe("settings")
    expect(requiredPermission("/settings/items/abc123/extra")).toBe("admin")
    expect(requiredPermission("/settings/categories")).toBe("settings")
    expect(requiredPermission("/settings/categories/new")).toBe("settings")
    expect(requiredPermission("/settings/categories/abc123")).toBe("settings")
    expect(requiredPermission("/settings/tables")).toBe("settings")
    expect(requiredPermission("/settings/tables/new")).toBe("settings")
    expect(requiredPermission("/settings/tables/abc123")).toBe("settings")
    expect(requiredPermission("/settings/access")).toBe("admin")
    expect(requiredPermission("/settings/access/add-device")).toBe("admin")
    expect(requiredPermission("/settings/payment-accounts")).toBe("admin")
    expect(requiredPermission("/settings/payment-accounts/iban")).toBe("admin")
    expect(
      requiredPermission("/settings/payment-accounts/iban/fio-plugin")
    ).toBe("admin")
    expect(requiredPermission("/settings/payment-accounts/spark")).toBe("admin")
    expect(requiredPermission("/settings/payment-accounts/cashu")).toBe("admin")
  })
})
