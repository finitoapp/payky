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
    expect(requiredPermission("/onboarding")).toBeNull()
    expect(requiredPermission("/restore-account")).toBeNull()
    expect(requiredPermission("/payment/tip")).toBe("sell")
  })
})
