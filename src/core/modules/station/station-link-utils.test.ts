import { describe, expect, test } from "vitest"

import { MasterKey } from "@/core/modules/shared/key-derivation.ts"
import { NostrPubkeyHex } from "@/core/modules/shared/schema.ts"
import {
  decodeStationLinkFragment,
  encodeStationLink,
  resolveStationLinkOrigin,
} from "./station-link-utils.ts"

const masterKey = MasterKey("000102030405060708090a0b0c0d0e0f")
const ownerPubkey = NostrPubkeyHex("ab".repeat(32))

describe("station link", () => {
  test("carries the station's keys in the fragment, never the path", () => {
    const link = encodeStationLink({
      origin: "https://payky.me",
      masterKey,
      ownerPubkey,
    })
    const url = new URL(link)

    expect(url.pathname).toBe("/pos")
    expect(url.search).toBe("")
    expect(url.hash).toHaveLength(1 + 66)
    expect(decodeStationLinkFragment(url.hash)).toEqual({
      ok: true,
      value: { masterKey, ownerPubkey },
    })
  })

  test("refuses a fragment that is not a station link", () => {
    expect(decodeStationLinkFragment("#not base64!")).toMatchObject({
      ok: false,
      error: { reason: "encoding" },
    })
    expect(decodeStationLinkFragment("AgAA")).toMatchObject({
      ok: false,
      error: { reason: "version" },
    })
    expect(decodeStationLinkFragment("AQAA")).toMatchObject({
      ok: false,
      error: { reason: "length" },
    })
  })

  test("points at the page's origin in a browser and at Payky from the app", () => {
    expect(
      resolveStationLinkOrigin({
        isNativePlatform: false,
        locationOrigin: "https://pos.example",
      })
    ).toBe("https://pos.example")
    expect(
      resolveStationLinkOrigin({
        isNativePlatform: true,
        locationOrigin: "https://localhost",
      })
    ).toBe("https://payky.me")
  })
})
