/**
 * Split out of fixtures.ts so non-Playwright consumers (the Remotion video
 * composition) can import the viewport size without pulling in
 * @playwright/test — Remotion bundles for the browser, and playwright-core
 * doesn't resolve there.
 */
export const pageWidth = 406
export const pageHeight = 818
