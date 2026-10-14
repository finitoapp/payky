declare global {
  interface Window {
    /**
     * Set by an e2e spec (`page.addInitScript`): the Cashu wallet syncs no
     * Linky owner and talks to an in-page fake mint instead of a real one.
     */
    __e2eCashuMint?: boolean
    /** Set by the app in that mode: the customer pays every open mint quote. */
    __e2eCashuPayQuotes?: () => number
  }
}

/**
 * Whether an e2e spec asked for the offline Cashu wallet. Inert in anything
 * shipped: the same `DEV || __E2E_TEST_BUILD__` gate as `E2eTestBridge`'s.
 */
export const isE2eCashu = (): boolean =>
  (import.meta.env.DEV || __E2E_TEST_BUILD__) &&
  typeof window !== "undefined" &&
  window.__e2eCashuMint === true

/** The fake mint's fetch, with `window.__e2eCashuPayQuotes` wired to it. */
export const createE2eCashuMintFetch = async (): Promise<
  typeof globalThis.fetch
> => {
  const [{ createFakeCashuMint }, { MAIN_MINT_URL }] = await Promise.all([
    import("@/core/cashu/fake-cashu-mint.ts"),
    import("@/core/cashu/cashu-mints.ts"),
  ])
  const mint = createFakeCashuMint({ url: MAIN_MINT_URL })
  window.__e2eCashuPayQuotes = () => {
    const ids = mint.mintQuoteIds()
    for (const id of ids) mint.payMintQuote(id)
    return ids.length
  }
  return mint.fetch
}
