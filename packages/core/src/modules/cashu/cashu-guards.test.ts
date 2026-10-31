import { describe, expect, test } from "vitest"
import { createRowId } from "../shared/evolu-utils.ts"
import {
  type CashuAttempt,
  latestOtherAttempt,
  latestOwnAttempt,
} from "./cashu-guards.ts"
import { KeysetId } from "./cashu-types.ts"

const oldKeyset = KeysetId("00aa")
const newKeyset = KeysetId("00bb")

const attempt = (
  fields: Pick<CashuAttempt, "keysetId" | "counter" | "createdAt" | "own">
): CashuAttempt => ({
  id: createRowId<"CashuOperationAttempt">(),
  slots: 4,
  role: "swap",
  rejected: false,
  contested: false,
  ownFence: false,
  ...fields,
})

describe("the latest attempt of a device", () => {
  // As the attempts query lists them: lowest slot first, whatever the keyset.
  const beforeRotation = {
    keysetId: oldKeyset,
    counter: 300,
    createdAt: "2026-10-30T10:00:00.000Z",
  }
  const afterRotation = {
    keysetId: newKeyset,
    counter: 4,
    createdAt: "2026-10-30T10:05:00.000Z",
  }

  test("another device's latest is its last reserved, not its highest slot of any keyset", () => {
    const later = attempt({ ...afterRotation, own: false })
    expect(
      latestOtherAttempt([later, attempt({ ...beforeRotation, own: false })])
    ).toBe(later)
  })

  test("this device's latest across keysets is its last reserved; in one keyset its highest slot", () => {
    const later = attempt({ ...afterRotation, own: true })
    const earlier = attempt({ ...beforeRotation, own: true })
    expect(latestOwnAttempt([later, earlier])).toBe(later)
    expect(latestOwnAttempt([later, earlier], oldKeyset)).toBe(earlier)
  })
})
