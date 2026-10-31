declare global {
  interface Window {
    /**
     * Set by an e2e spec (`page.addInitScript`): the wallet talks to an
     * in-page fake mint, not a real one.
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

/**
 * The fake mints' fetch: one at every preset mint, so a suggestion can be
 * trusted and made the default (cashu/0015). A melt at any of them pays the
 * invoice wherever it was issued, and `window.__e2eCashuPayQuotes` pays every
 * open quote at all of them.
 */
export const createE2eCashuMintFetch = async (): Promise<
  typeof globalThis.fetch
> => {
  const [{ createFakeCashuMint, createFakeMintsFetch }, { PRODUCTION_MINTS }] =
    await Promise.all([
      import("@payky/core/cashu/fake-cashu-mint"),
      import("@payky/core/modules/cashu/cashu-utils"),
    ])
  const payInvoice = (invoice: string) => {
    for (const mint of mints) mint.payInvoice(invoice)
  }
  const mints = PRODUCTION_MINTS.map((url) =>
    createFakeCashuMint({ url, onInvoicePaid: payInvoice })
  )
  window.__e2eCashuPayQuotes = () => {
    let paid = 0
    for (const mint of mints)
      for (const id of mint.mintQuoteIds()) {
        mint.payMintQuote(id)
        paid += 1
      }
    return paid
  }
  return createFakeMintsFetch(mints)
}
