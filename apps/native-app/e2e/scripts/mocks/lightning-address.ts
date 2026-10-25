// The merchant's wallets behind Lightning addresses
// (apps/web-app/e2e/support/lightning-address-mocks.ts), reached through
// `/__host/wallet.e2e.test/...` (src/e2e/e2e-fetch.ts). Each is the fake the
// web specs and the demo use (createFakeLightningAddressWallet). Web's specs
// pay the invoice from the test; a flow cannot call the mock, so the address
// decides, and an invoice is paid `SETTLE_AFTER_MS` after its callback
// issued it — long enough for a flow to see the QR, or to leave the screen,
// first:
// - shop@wallet.e2e.test settles with the preimage that proves it,
// - nopreimage@wallet.e2e.test settles without one, as ZEUS Pay does,
// - noverify@wallet.e2e.test issues invoices without a LUD-21 verify URL.
import {
  createFakeLightningAddressWallet,
  type FakeLightningAddressWallet,
} from "@payky/core/integrations/lnurl/fake-lightning-address-wallet"
import type { MockHandler } from "./mock-handler.ts"

const SETTLE_AFTER_MS = 10_000
const HOST = "wallet.e2e.test"
const HOST_PREFIX = `/__host/${HOST}`

interface MockWallet {
  readonly wallet: FakeLightningAddressWallet
  readonly issued: Array<{ readonly pr: string; readonly at: number }>
}

const createWallet = (
  name: string,
  options: Partial<FakeLightningAddressWallet["options"]>
): MockWallet => {
  const wallet = createFakeLightningAddressWallet({
    address: `${name}@${HOST}`,
    now: () => Date.now(),
  })
  Object.assign(wallet.options, options)
  return { wallet, issued: [] }
}

const wallets: Readonly<Record<string, MockWallet>> = {
  shop: createWallet("shop", {}),
  nopreimage: createWallet("nopreimage", { revealsPreimage: false }),
  noverify: createWallet("noverify", { verify: false }),
}

/** The wallet a path belongs to: `/.well-known/lnurlp/<name>` or `/lnurlp/<name>/...`. */
const walletName = (pathname: string): string | undefined =>
  pathname.match(/^\/(?:\.well-known\/)?lnurlp\/([^/]+)/)?.[1]

export const lightningAddressMock: MockHandler = async (_request, url) => {
  if (!url.pathname.startsWith(`${HOST_PREFIX}/`)) return undefined
  const pathname = url.pathname.slice(HOST_PREFIX.length)
  const name = walletName(pathname)
  const mock = name === undefined ? undefined : wallets[name]
  if (mock === undefined) return undefined

  if (pathname.includes("/verify/")) {
    for (const { pr, at } of mock.issued) {
      if (Date.now() - at > SETTLE_AFTER_MS) mock.wallet.pay(pr)
    }
  }

  const response = await mock.wallet.fetch(
    new URL(`${pathname}${url.search}`, `https://${HOST}`)
  )
  if (response === null) return undefined
  if (pathname.endsWith("/callback")) {
    const body: unknown = await response.clone().json()
    if (typeof body === "object" && body !== null && "pr" in body) {
      mock.issued.push({ pr: String(body.pr), at: Date.now() })
    }
  }
  return response
}
