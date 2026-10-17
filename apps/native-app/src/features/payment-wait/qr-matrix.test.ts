import { describe, expect, it } from "vitest"
import { qrPath } from "./qr-matrix.ts"

describe("qrPath", () => {
  it("draws a square code with dark modules for a SPAYD payload", () => {
    const { size, path } = qrPath(
      "SPD*1.0*ACC:CZ6508000000192000145399*AM:129.00*CC:CZK"
    )
    expect(size).toBeGreaterThanOrEqual(21)
    expect(path.startsWith("M")).toBe(true)
    // The top-left finder pattern starts at the origin.
    expect(path).toContain("M0 0h1v1h-1z")
  })
})
