import { deriveDefaultProfile } from "@linky/profile-defaults"
import { describe, expect, test } from "vitest"

import { parseProfileMetadata } from "@/core/linky/nostr-profile.ts"

describe("parseProfileMetadata", () => {
  test("prefers display_name over name and keeps a renderable picture", () => {
    expect(
      parseProfileMetadata(
        JSON.stringify({
          name: "hynek",
          display_name: "  Hynek  Jína ",
          picture: "https://example.com/me.png",
        })
      )
    ).toEqual({
      name: "Hynek Jína",
      pictureUrl: "https://example.com/me.png",
    })
  })

  test("drops a picture that is not an http(s) or data url", () => {
    expect(
      parseProfileMetadata(
        JSON.stringify({ name: "hynek", picture: "javascript:alert(1)" })
      )
    ).toEqual({ name: "hynek", pictureUrl: null })
  })

  test("returns null for content that is not a metadata object", () => {
    expect(parseProfileMetadata("not json")).toBeNull()
    expect(parseProfileMetadata("[]")).toBeNull()
  })
})

describe("generated profile defaults", () => {
  test("are deterministic for an npub, as in Linky", () => {
    const npub =
      "npub1emlla45qgkxa0n6yj243m0uygv6332atrxckg7z5c4226lg3ke2qxdfpgk"
    const first = deriveDefaultProfile(npub, "cs")
    expect(first).toEqual(deriveDefaultProfile(npub, "cs"))
    expect(first.name.length).toBeGreaterThan(0)
    expect(first.pictureUrl).toMatch(/^https:\/\/api\.dicebear\.com\//)
  })
})
