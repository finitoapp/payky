import { describe, expect, test } from "vitest"
import { CashuQuoteId, CashuTokenText, MintUrl } from "./cashu-types.ts"
import {
  cashuMeltOperationIdFor,
  cashuProofIdFor,
  cashuReceiveOperationIdFor,
  cashuTopupOperationIdFor,
  MAIN_MINT_URL,
  nextDefaultedAt,
  normalizeCashuTokenText,
  normalizeMintUrl,
  orderCashuRequestMints,
  orderTrustedCashuMints,
  parseMintUrlInput,
  pickDefaultCashuMint,
  sumAvailableByMint,
  type TrustedCashuMint,
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

  test("the balance per mint counts available proofs only", () => {
    const mint = MintUrl("https://cashu.cz")
    expect(
      sumAvailableByMint([
        { mintUrl: mint, amount: 8, state: "available" },
        { mintUrl: mint, amount: 2, state: "available" },
        { mintUrl: mint, amount: 4, state: "held" },
        { mintUrl: mint, amount: 16, state: "spent" },
      ])
    ).toEqual(new Map([[mint, 10]]))
  })
})

const trusted = (
  mintUrl: string,
  defaultedAt: number | null,
  createdAt = "2026-10-01T00:00:00.000Z"
): TrustedCashuMint => ({ mintUrl: MintUrl(mintUrl), defaultedAt, createdAt })

describe("the default mint (cashu/0013)", () => {
  test("the newest choice wins", () => {
    expect(
      pickDefaultCashuMint([
        trusted("https://a.mint.test", 10),
        trusted("https://b.mint.test", 30),
        trusted("https://c.mint.test", null),
      ])
    ).toEqual({ mintUrl: "https://b.mint.test", chosen: true })
  })

  test("a tie goes to the smaller URL, so every device picks the same one", () => {
    const rows = [
      trusted("https://b.mint.test", 30),
      trusted("https://a.mint.test", 30),
    ]
    expect(pickDefaultCashuMint(rows).mintUrl).toBe("https://a.mint.test")
    expect(pickDefaultCashuMint([...rows].reverse()).mintUrl).toBe(
      "https://a.mint.test"
    )
  })

  test("with no choice the newest trusted mint stands in, then MAIN_MINT_URL", () => {
    expect(
      pickDefaultCashuMint([
        trusted("https://a.mint.test", null, "2026-10-01T00:00:00.000Z"),
        trusted("https://b.mint.test", null, "2026-10-02T00:00:00.000Z"),
      ])
    ).toEqual({ mintUrl: "https://b.mint.test", chosen: false })
    expect(pickDefaultCashuMint([])).toEqual({
      mintUrl: MAIN_MINT_URL,
      chosen: false,
    })
  })

  test("a new choice is later than one written by a clock running ahead", () => {
    expect(nextDefaultedAt(1_000, null)).toBe(1_000)
    expect(nextDefaultedAt(1_000, 500)).toBe(1_000)
    expect(nextDefaultedAt(1_000, 9_000_000)).toBe(9_000_001)
  })
})

describe("the order of the trusted mints (cashu/0017)", () => {
  const rows = [
    trusted("https://never-b.mint.test", null),
    trusted("https://older.mint.test", 10),
    trusted("https://never-a.mint.test", null),
    trusted("https://default.mint.test", 30),
    trusted("https://newer.mint.test", 20),
  ]

  test("the default first, then by the last choice, then the never-chosen by URL", () => {
    expect(orderTrustedCashuMints(rows)).toEqual([
      "https://default.mint.test",
      "https://newer.mint.test",
      "https://older.mint.test",
      "https://never-a.mint.test",
      "https://never-b.mint.test",
    ])
  })

  test("the request names at most the cap, the default first", () => {
    expect(orderCashuRequestMints(rows, 3)).toEqual([
      "https://default.mint.test",
      "https://newer.mint.test",
      "https://older.mint.test",
    ])
  })

  test("with no trusted row the default MAIN_MINT_URL is the one trusted mint", () => {
    expect(orderTrustedCashuMints([])).toEqual([MAIN_MINT_URL])
  })
})
