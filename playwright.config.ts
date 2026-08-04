import { defineConfig, devices } from "@playwright/test"
import { pageHeight, pageWidth } from "./e2e/fixtures.ts"

const e2ePort = 5174
const baseURL = `https://127.0.0.1:${e2ePort}`

// PAYKY_E2E_SERVER=preview runs against a production build already built by
// `bun run test:e2e:preview` (`vite build` once, then `vite preview` to serve
// it), instead of the dev server. basic-ssl still applies to `vite preview`
// (see vite.config.ts), so this stays over HTTPS like the default dev-server
// run.
const useProductionBuild = process.env.PAYKY_E2E_SERVER === "preview"
const webServerCommand = useProductionBuild
  ? `vite preview --host 127.0.0.1 --port ${e2ePort} --strictPort`
  : `bun run dev -- --host 127.0.0.1 --port ${e2ePort} --strictPort`

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [["list"], ["github"], ["html", { open: "never" }]]
    : "html",
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    locale: "en-US",
    timezoneId: "Europe/Prague",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    viewport: { width: pageWidth, height: pageHeight },
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: webServerCommand,
    url: baseURL,
    ignoreHTTPSErrors: true,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
