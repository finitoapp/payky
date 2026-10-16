import { describe, expect, test } from "vitest"
import {
  emptyScanBuffer,
  MAX_SCAN_KEY_GAP_MS,
  readScanKey,
} from "@/hooks/use-hardware-scanner.ts"

const feed = (
  keys: ReadonlyArray<readonly [key: string, timeStamp: number]>
): ReadonlyArray<string> => {
  const scanned: string[] = []
  let buffer = emptyScanBuffer
  for (const [key, timeStamp] of keys) {
    const result = readScanKey(buffer, { key, timeStamp })
    buffer = result.buffer
    if (result.scanned !== null) scanned.push(result.scanned)
  }
  return scanned
}

const burst = (code: string, start: number, gap = 5) =>
  [...code, "Enter"].map((key, index) => [key, start + index * gap] as const)

describe("readScanKey", () => {
  test("a fast burst closed by Enter is a scan", () => {
    expect(feed(burst("8594001234567", 1000))).toEqual(["8594001234567"])
  })

  test("typing at human speed is not a scan", () => {
    expect(feed(burst("1234", 1000, MAX_SCAN_KEY_GAP_MS + 1))).toEqual([])
  })

  test("a burst shorter than the minimum is not a scan", () => {
    expect(feed(burst("123", 1000))).toEqual([])
  })

  test("a slow start is dropped and only the fast tail is scanned", () => {
    expect(feed([["9", 0], ...burst("4006381333931", 1000)])).toEqual([
      "4006381333931",
    ])
  })

  test("Shift between uppercase letters does not break the burst", () => {
    expect(
      feed([
        ["Shift", 1000],
        ["A", 1002],
        ["Shift", 1004],
        ["B", 1006],
        ["1", 1010],
        ["2", 1015],
        ["Enter", 1020],
      ])
    ).toEqual(["AB12"])
  })

  test("a non-printable key breaks the burst", () => {
    expect(
      feed([
        ["1", 1000],
        ["2", 1005],
        ["Backspace", 1010],
        ["3", 1015],
        ["4", 1020],
        ["Enter", 1025],
      ])
    ).toEqual([])
  })

  test("Enter after a pause is not a scan", () => {
    expect(
      feed([
        ...burst("12345", 1000).slice(0, -1),
        ["Enter", 1000 + 4 * 5 + MAX_SCAN_KEY_GAP_MS + 1],
      ])
    ).toEqual([])
  })
})
