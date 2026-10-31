import { MintUrlSchema } from "@payky/core/modules/cashu/cashu-types"
import {
  MAIN_MINT_URL,
  PRODUCTION_MINTS,
  trustedCashuMintsOf,
} from "@payky/core/modules/cashu/cashu-utils"
import { expect, it } from "vitest"
import { getCashuMintSections } from "./cashu-mints-page-model.ts"

const own = MintUrlSchema.parse("https://wallet.example")
const [, minibits] = PRODUCTION_MINTS
if (minibits === undefined) throw new Error("no second preset")

it("lists the trusted mints in their order and leaves them out of the suggestions", () => {
  const sections = getCashuMintSections([own, MAIN_MINT_URL], new Map())

  expect(sections.trusted).toEqual([own, MAIN_MINT_URL])
  expect(sections.withBalance).toEqual([])
  expect(sections.suggested).toEqual(
    PRODUCTION_MINTS.filter((mint) => mint !== MAIN_MINT_URL)
  )
})

it("puts a mint not trusted that holds a balance apart, not among the suggestions", () => {
  const sections = getCashuMintSections(
    [MAIN_MINT_URL],
    new Map([
      [minibits, 21],
      [MAIN_MINT_URL, 5],
      [own, 0],
    ])
  )

  expect(sections.withBalance).toEqual([minibits])
  expect(sections.suggested).not.toContain(minibits)
  expect(sections.suggested).not.toContain(own)
})

it("a device that knows no trusted mint lists none as trusted, MAIN_MINT_URL among the suggestions (cashu/0018)", () => {
  const sections = getCashuMintSections(trustedCashuMintsOf([]), new Map())

  expect(sections.trusted).toEqual([])
  expect(sections.suggested).toEqual(PRODUCTION_MINTS)
})
