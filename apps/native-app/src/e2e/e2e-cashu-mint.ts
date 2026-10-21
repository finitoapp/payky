import { nativeEnv } from "../core/native-env.ts"

/**
 * The offline Cashu wallet for e2e, the twin of web's `window.__e2eCashuMint`
 * (`e2e-cashu-mint.ts`): switched on by the `fake` bridge action's `cashu=manual`,
 * it lasts until the app restarts. `cashu=autopay` also pays every open
 * quote every few seconds by itself: on web a link reloads the page, which
 * would lose the in-memory mint that `cashuPayQuotes` needs.
 * Inert unless `EXPO_PUBLIC_PAYKY_E2E`.
 */
let active: "manual" | "autopay" | null = null
let payQuotes: (() => number) | null = null

export const setE2eCashu = (mode: "manual" | "autopay" | null) => {
  active = mode
}

export const isE2eCashu = (): boolean =>
  nativeEnv.EXPO_PUBLIC_PAYKY_E2E && active !== null

/** The `cashuPayQuotes` action's body: the customer pays every open quote. */
export const payE2eCashuQuotes = (): number => {
  if (payQuotes === null) throw new Error("The fake Cashu mint is not running.")
  return payQuotes()
}

/** The fake mint's fetch, with `payE2eCashuQuotes` wired to it. */
export const createE2eCashuMintFetch = async (): Promise<
  typeof globalThis.fetch
> => {
  const [{ createFakeCashuMint }, { MAIN_MINT_URL }] = await Promise.all([
    import("@payky/core/cashu/fake-cashu-mint"),
    import("@payky/core/cashu/cashu-mints"),
  ])
  const mint = createFakeCashuMint({ url: MAIN_MINT_URL })
  payQuotes = () => {
    const ids = mint.mintQuoteIds()
    for (const id of ids) mint.payMintQuote(id)
    return ids.length
  }
  // ponytail: a fixed poll, long enough for a flow to see the QR first
  if (active === "autopay") setInterval(payQuotes, 4000)
  return mint.fetch
}
