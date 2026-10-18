import { MAIN_MINT_URL, PRODUCTION_MINTS } from "@payky/core/cashu/cashu-mints"
import { MintUrlSchema } from "@payky/core/modules/cashu/cashu-types"
import { expect, it } from "vitest"
import { getCashuMintSections } from "./cashu-mints-page-model.ts"

it("puts the default first and excludes known mints from suggestions", () => {
  const known = MintUrlSchema.parse("https://wallet.example")
  const sections = getCashuMintSections(MAIN_MINT_URL, [known, MAIN_MINT_URL])

  expect(sections.known).toEqual([MAIN_MINT_URL, known])
  expect(sections.suggested).toEqual(
    PRODUCTION_MINTS.filter((mint) => mint !== MAIN_MINT_URL)
  )
})

it("shows presets as suggestions when the wallet has no known mint", () => {
  expect(getCashuMintSections(null, [])).toEqual({
    known: [],
    suggested: PRODUCTION_MINTS,
  })
})
