/**
 * Self-contained on purpose: `vite.config.ts` also injects it into Evolu's
 * worker chunks as source text, next to `installOneTabLocks`.
 */
export function isAndroidWebView() {
  const userAgent = globalThis.navigator.userAgent

  return /Android/i.test(userAgent) && /; wv\)|\bwv\b/i.test(userAgent)
}
