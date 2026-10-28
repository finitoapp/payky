import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { requiredPermission } from "../../../core/route-access.ts"

const page = readFileSync(
  new URL("./cashu-account-settings-page.tsx", import.meta.url),
  "utf8"
)
const walletHook = readFileSync(
  new URL("../../shared/cashu/use-cashu-wallet.ts", import.meta.url),
  "utf8"
)

it("keeps the Cashu overview owner-only and read-only", () => {
  expect(requiredPermission("/settings/payment-accounts/cashu")).toBe("admin")
  expect(page).toContain('href: "/cashu-withdraw"')
  expect(page).not.toMatch(
    /saveCashuAccount|setDefaultCashuMint|Wallet\.|Mint\./u
  )
  expect(walletHook).not.toMatch(
    /cashuWalletDepAtom|deriveCashuWalletSeed|loadCashuWallet/u
  )
})

it("reads the wallet and its default mint live", () => {
  expect(walletHook).toContain("useEvoluQuery(cashuBalancesQuery)")
  expect(walletHook).toContain("useEvoluQuery(cashuTrustedMintsQuery)")
  expect(walletHook).not.toContain("cashuAccountQuery")
  expect(page).toContain("wallet.defaultMint")
  expect(page).toContain("wallet.balances.size === 0")
})
