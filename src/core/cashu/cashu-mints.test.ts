import { describe, expect, test } from "vitest"

import {
  loadCashuDefaultMint,
  MAIN_MINT_URL,
  seedCashuDefaultMint,
  writeCashuDefaultMint,
} from "@/core/cashu/cashu-mints.ts"
import { MintUrl } from "@/core/modules/cashu/cashu-types.ts"
import { createCashuTest } from "@/test/cashu.ts"

describe("the default mint", () => {
  test("is Linky's default until a wallet names one", async () => {
    await using t = await createCashuTest()
    expect(await loadCashuDefaultMint(t.deps.cashuShardStore)).toBe(
      MAIN_MINT_URL
    )
  })

  test("is read from Linky's synced setting", async () => {
    await using t = await createCashuTest()
    const store = t.deps.cashuShardStore
    await store.writeSetting("defaultMint", "https://mint.minibits.cash")
    expect(await loadCashuDefaultMint(store)).toBe(
      "https://mint.minibits.cash/Bitcoin"
    )
  })

  test("is seeded once when Cashu is enabled, never over a mint Linky chose", async () => {
    await using t = await createCashuTest()
    const store = t.deps.cashuShardStore
    await seedCashuDefaultMint(store)
    expect(await store.readSetting("defaultMint")).toBe(MAIN_MINT_URL)

    await writeCashuDefaultMint(store, MintUrl("https://kashu.me"))
    await seedCashuDefaultMint(store)
    expect(await store.readSetting("defaultMint")).toBe("https://kashu.me")
  })
})
