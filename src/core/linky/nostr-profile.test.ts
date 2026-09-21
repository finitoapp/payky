import { describe, expect, test } from "vitest"

import {
  buildUpdatedProfileMetadata,
  parseProfileMetadata,
} from "@/core/linky/nostr-profile.ts"

describe("parseProfileMetadata", () => {
  test("prefers display_name over name and keeps a renderable picture", () => {
    expect(
      parseProfileMetadata(
        JSON.stringify({
          name: "hynek",
          display_name: "  Hynek  Jína ",
          picture: "https://example.com/me.png",
          lud16: "npub1x@linky.fit",
        })
      )
    ).toMatchObject({
      name: "Hynek Jína",
      pictureUrl: "https://example.com/me.png",
      metadata: { lud16: "npub1x@linky.fit" },
    })
  })

  test("drops a picture that is not an http(s) or data url", () => {
    expect(
      parseProfileMetadata(
        JSON.stringify({ name: "hynek", picture: "javascript:alert(1)" })
      )
    ).toMatchObject({ name: "hynek", pictureUrl: null })
  })

  test("returns null for content that is not a metadata object", () => {
    expect(parseProfileMetadata("not json")).toBeNull()
    expect(parseProfileMetadata("[]")).toBeNull()
  })
})

describe("buildUpdatedProfileMetadata", () => {
  test("replaces the name fields and picture but keeps every other field", () => {
    expect(
      buildUpdatedProfileMetadata({
        current: {
          name: "old",
          display_name: "Old",
          picture: "https://example.com/old.png",
          lud16: "npub1x@linky.fit",
          about: "hi",
        },
        name: "  New  Name ",
        pictureUrl: "data:image/jpeg;base64,AAAA",
      })
    ).toEqual({
      lud16: "npub1x@linky.fit",
      about: "hi",
      name: "New Name",
      display_name: "New Name",
      picture: "data:image/jpeg;base64,AAAA",
    })
  })

  test("clears the name and picture when the user removed them", () => {
    expect(
      buildUpdatedProfileMetadata({
        current: { name: "old", picture: "x", about: "hi" },
        name: "",
        pictureUrl: null,
      })
    ).toEqual({ about: "hi" })
  })
})
