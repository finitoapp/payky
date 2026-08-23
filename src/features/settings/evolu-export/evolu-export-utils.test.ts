import { describe, expect, test } from "vitest"

import {
  createEvoluExportFilename,
  formatBytes,
  formatExportCreatedAt,
} from "./evolu-export-utils.ts"

describe("formatBytes", () => {
  test("formats sub-kibibyte sizes in bytes", () => {
    expect(formatBytes(512)).toBe("512 B")
  })

  test("formats kibibytes", () => {
    expect(formatBytes(2048)).toBe("2.0 KiB")
  })

  test("formats mebibytes", () => {
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MiB")
  })

  test("formats gibibytes", () => {
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe("2.0 GiB")
  })

  test("formats tebibytes once it exceeds gibibytes", () => {
    expect(formatBytes(2 * 1024 * 1024 * 1024 * 1024)).toBe("2.0 TiB")
  })
})

describe("createEvoluExportFilename", () => {
  test("includes the database name and a zero-padded timestamp", () => {
    const createdAt = new Date(2026, 0, 5, 9, 3, 7)

    expect(createEvoluExportFilename({ createdAt, database: "app" })).toBe(
      "payky-evolu-app-export-2026-01-05-090307.sqlite"
    )
  })

  test("supports the device database", () => {
    const createdAt = new Date(2026, 11, 31, 23, 59, 59)

    expect(createEvoluExportFilename({ createdAt, database: "device" })).toBe(
      "payky-evolu-device-export-2026-12-31-235959.sqlite"
    )
  })
})

describe("formatExportCreatedAt", () => {
  test("formats a date using medium date and time styles", () => {
    const formatted = formatExportCreatedAt(new Date(2026, 0, 5, 9, 3, 7))

    expect(typeof formatted).toBe("string")
    expect(formatted.length).toBeGreaterThan(0)
  })
})
