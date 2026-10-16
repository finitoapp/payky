/** The mint as the lists name it: without the scheme, its path kept (Linky's `formatMintLabel`). */
export const formatMintLabel = (mint: string): string =>
  mint.replace(/^https?:\/\//u, "")
