import { fileURLToPath } from "node:url"
import type { WebpackOverrideFn } from "@remotion/bundler"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))

/**
 * Remotion bundles with its own webpack config, separate from Vite's, so it
 * doesn't know the app's `@/*` -> `src/*` alias (tsconfig `paths`). Anything
 * pulled in transitively from app code — e.g. e2e/fixtures.ts importing
 * src/i18n/resources.ts — needs this to resolve.
 */
export const paykyWebpackOverride: WebpackOverrideFn = (config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: {
      ...config.resolve?.alias,
      "@": `${projectRoot}/src`,
    },
  },
})
