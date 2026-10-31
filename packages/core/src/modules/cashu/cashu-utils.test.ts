import { describe, expect, test } from "vitest"
import { z } from "zod"
import {
  CashuQuoteId,
  CashuTokenArrivalStateSchema,
  CashuTokenText,
  MintUrl,
} from "./cashu-types.ts"
import {
  CashuTrustedMintsJson,
  cashuArrivalKeepsRequest,
  cashuMeltOperationIdFor,
  cashuProofIdFor,
  cashuReceiveOperationIdFor,
  cashuTopupOperationIdFor,
  defaultCashuMintWithout,
  MAIN_MINT_URL,
  normalizeCashuTokenText,
  normalizeMintUrl,
  orderCashuRequestMints,
  parseMintUrlInput,
  pickDefaultCashuMint,
  trustedCashuMintsOf,
} from "./cashu-utils.ts"

const MINT_URL_VECTORS: ReadonlyArray<
  readonly [input: string, normalized: string | null]
> = [
  ["https://cashu.cz", "https://cashu.cz"],
  [" https://cashu.cz/ ", "https://cashu.cz"],
  ["https://cashu.cz///", "https://cashu.cz"],
  ["https://mint.minibits.cash", "https://mint.minibits.cash/Bitcoin"],
  ["https://MINT.minibits.cash/Bitcoin/", "https://mint.minibits.cash/Bitcoin"],
  [
    "https://mint.minibits.cash/Bitcoin?x=1",
    "https://mint.minibits.cash/Bitcoin",
  ],
  ["https://mint.example.com/path/?a=1#x", "https://mint.example.com/path"],
  ["HTTPS://Cashu.CZ", "https://cashu.cz"],
  ["http://localhost:3338/", "http://localhost:3338"],
  ["https://kashu.me/sub/path//", "https://kashu.me/sub/path"],
  ["https://user:pw@mint.example.com/", "https://mint.example.com"],
  ["cashu.cz", null],
  ["", null],
  ["ftp://x.y", null],
]

/** What a receive's operation id hashes. */
const TOKEN_TEXT_VECTORS: ReadonlyArray<
  readonly [input: string, tokenText: string | null]
> = [
  [
    '{"id":"pay-1","memo":"Káva","mint":"https://cashu.cz","unit":"sat","proofs":[{"id":"00ad268c4d1f5826","amount":8,"secret":"s1","C":"02aa","dleq":{"e":"x"}},{"amount":2,"id":"00ad268c4d1f5826","secret":"s2","C":"02bb"}]}',
    "cashuAeyJ0b2tlbiI6W3sibWludCI6Imh0dHBzOi8vY2FzaHUuY3oiLCJwcm9vZnMiOlt7ImlkIjoiMDBhZDI2OGM0ZDFmNTgyNiIsImFtb3VudCI6OCwic2VjcmV0IjoiczEiLCJDIjoiMDJhYSIsImRsZXEiOnsiZSI6IngifX0seyJhbW91bnQiOjIsImlkIjoiMDBhZDI2OGM0ZDFmNTgyNiIsInNlY3JldCI6InMyIiwiQyI6IjAyYmIifV19XSwidW5pdCI6InNhdCJ9",
  ],
  ["  cashuBo2FteBhodHRwczovL2NAA  ", "cashuBo2FteBhodHRwczovL2NAA"],
  ["cashuB with space", null],
  ["hello", null],
]

describe("Cashu ids and spellings", () => {
  test.each(TOKEN_TEXT_VECTORS)("token text of %j", (input, tokenText) => {
    expect(normalizeCashuTokenText(input)).toBe(tokenText)
  })

  test.each(MINT_URL_VECTORS)("mint url %j normalises to %j", (input, out) => {
    expect(normalizeMintUrl(input)).toBe(out)
  })

  test("operation ids derive from what the operation is about, so devices agree", () => {
    const mint = MintUrl("https://cashu.cz")
    expect(cashuTopupOperationIdFor(mint, CashuQuoteId("q1"))).toBe(
      "BGlgDe11qmFny9YMFDFEMA"
    )
    expect(cashuReceiveOperationIdFor(CashuTokenText("cashuBabc"))).toBe(
      "Jp7BJO58G7fLgNCYxFZ5vw"
    )
    expect(cashuMeltOperationIdFor(mint, CashuQuoteId("m1"))).toBe(
      "v8OkMn4X0n6QC4aCZBJqWQ"
    )
  })

  test("a proof id hashes its secret", () => {
    expect(
      cashuProofIdFor(
        "407915bc212be61a77e3e6d2aeb4c727980bda51cd06a6afc29e2861768a7837"
      )
    ).toBe("BZPKWM_sfeFRihXDyPbdLw")
  })

  test("a typed mint URL gets https and needs a dot in its host", () => {
    expect(parseMintUrlInput("cashu.cz/")).toBe("https://cashu.cz")
    expect(parseMintUrlInput(" https://mint.minibits.cash ")).toBe(
      "https://mint.minibits.cash/Bitcoin"
    )
    expect(parseMintUrlInput("localhost")).toBeNull()
    expect(parseMintUrlInput("")).toBeNull()
  })
})

const listRow = (...mints: ReadonlyArray<string>) => ({
  trustedMintsJson: z.encode(
    CashuTrustedMintsJson,
    mints.map((mint) => MintUrl(mint))
  ),
  seedMintUrl: null,
})

describe("the trusted mints (cashu/0013)", () => {
  test("are the list as written, the default first", () => {
    const trusted = trustedCashuMintsOf([
      listRow("https://b.mint.test", "https://a.mint.test"),
    ])
    expect(trusted).toEqual(["https://b.mint.test", "https://a.mint.test"])
    expect(pickDefaultCashuMint(trusted)).toBe("https://b.mint.test")
  })

  test("a list written anywhere outranks the seed, whichever came later", () => {
    expect(
      trustedCashuMintsOf([
        { ...listRow("https://a.mint.test"), seedMintUrl: MAIN_MINT_URL },
      ])
    ).toEqual(["https://a.mint.test"])
    expect(
      trustedCashuMintsOf([
        { trustedMintsJson: null, seedMintUrl: MAIN_MINT_URL },
      ])
    ).toEqual([MAIN_MINT_URL])
  })

  test("with no row, or neither cell, no mint is trusted and there is no default, MAIN_MINT_URL included (cashu/0018)", () => {
    expect(trustedCashuMintsOf([])).toEqual([])
    expect(
      trustedCashuMintsOf([{ trustedMintsJson: null, seedMintUrl: null }])
    ).toEqual([])
    expect(pickDefaultCashuMint([])).toBeNull()
  })

  test("untrusting the default hands it to the next in the list", () => {
    const trusted = trustedCashuMintsOf([
      listRow("https://a.mint.test", "https://b.mint.test"),
    ])
    expect(
      defaultCashuMintWithout(trusted, MintUrl("https://a.mint.test"))
    ).toBe("https://b.mint.test")
    expect(
      defaultCashuMintWithout(
        [MintUrl("https://a.mint.test")],
        MintUrl("https://a.mint.test")
      )
    ).toBeNull()
  })
})

describe("the order of the trusted mints (cashu/0016)", () => {
  const trusted = trustedCashuMintsOf([
    listRow(
      "https://default.mint.test",
      "https://newer.mint.test",
      "https://older.mint.test",
      "https://fourth.mint.test"
    ),
  ])

  test("the request names at most the cap, the default first", () => {
    expect(orderCashuRequestMints(trusted, 3)).toEqual([
      "https://default.mint.test",
      "https://newer.mint.test",
      "https://older.mint.test",
    ])
  })

  test("with no trusted mint the request names none, MAIN_MINT_URL included (cashu/0018)", () => {
    expect(orderCashuRequestMints(trustedCashuMintsOf([]), 3)).toEqual([])
  })
})

describe("the wait screen's arrival note (cashu/0020)", () => {
  test("an arrival that leaves the payment unpaid keeps the QR: an untrusted mint, spent elsewhere for good, refused for good", () => {
    expect(
      CashuTokenArrivalStateSchema.options.filter(cashuArrivalKeepsRequest)
    ).toEqual(["untrustedMint", "receivedElsewhere", "contested", "failed"])
  })

  test("an arrival that pays the payment, or may still pay it, replaces the QR: receiving, waiting for the mint, received, receiving or checked for on another device", () => {
    expect(
      CashuTokenArrivalStateSchema.options.filter(
        (state) => !cashuArrivalKeepsRequest(state)
      )
    ).toEqual([
      "receiving",
      "waitingForMint",
      "received",
      "receivingElsewhere",
      "checkingElsewhere",
    ])
  })
})
