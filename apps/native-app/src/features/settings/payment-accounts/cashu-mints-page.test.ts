import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { requiredPermission } from "../../../core/route-access.ts"

const page = readFileSync(
  new URL("./cashu-mints-page.tsx", import.meta.url),
  "utf8"
)
const knownMints = readFileSync(
  new URL("../../shared/cashu/use-cashu-known-mints.ts", import.meta.url),
  "utf8"
)
const subscription = readFileSync(
  new URL(
    "../../shared/cashu/cashu-wallet-snapshot-subscription.ts",
    import.meta.url
  ),
  "utf8"
)

it("keeps the native mints list owner-only and read-only", () => {
  expect(requiredPermission("/settings/payment-accounts/cashu/mints")).toBe(
    "admin"
  )
  expect(page).toContain("useCashuKnownMints()")
  expect(page).toContain("!snapshot.hydrated")
  expect(page).toContain("snapshot.hydrated ?")
  expect(page).not.toMatch(
    /addKnownCashuMint|removeKnownCashuMint|writeCashuDefaultMint|loadCashuWallet/u
  )
})

it("scopes known mints to both the Linky and device account", () => {
  expect(knownMints).toContain(
    '"cashuKnownMints", store.linkyAppOwner.id, account.id'
  )
  expect(knownMints).toContain("loadKnownCashuMints")
  expect(knownMints).toContain("cashuDeviceKnownMintsQuery(account.id)")
  expect(knownMints).toContain("subscribeToCashuWalletSnapshot")
  expect(subscription).toContain("stopAdditional?.()")
})
