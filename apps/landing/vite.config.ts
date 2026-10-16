import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import type { PluginOption } from "vite"
import { defineConfig } from "vitest/config"

/**
 * The landing page is its own document, prerendered once per language by
 * `scripts/prerender-landing.ts` (landing/0002). These middlewares give the dev
 * and preview servers the addresses `vercel.json` gives production: the dev
 * server serves the unrendered template, which renders in the browser, and
 * the preview server serves the prerendered file for the address's
 * language, Czech at `/landing`.
 */
function landingPagesPlugin(): PluginOption {
  const landingPath =
    /^\/landing(?:\/([a-z]{2}))?(?:\/(eet-2-0|jak-to-funguje))?\/?(?:\?.*)?$/u
  // The EET page (landing/0006) and the page on how Payky works (landing/0008)
  // have a file of their own per language.
  const documentFiles: Record<string, string> = {
    "eet-2-0": "-eet",
    "jak-to-funguje": "-tech",
  }
  return {
    name: "payky-landing-pages",
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        if (request.url !== undefined && landingPath.test(request.url)) {
          request.url = "/landing/landing.html"
        }
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, _response, next) => {
        const match = request.url?.match(landingPath)
        if (match) {
          request.url = `/landing/landing${documentFiles[match[2] ?? ""] ?? ""}-${match[1] ?? "cs"}.html`
        }
        next()
      })
    },
  }
}

export default defineConfig({
  base: "/landing/",
  plugins: [react(), tailwindcss(), landingPagesPlugin()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  server: { host: "127.0.0.1", port: 5175, strictPort: true },
  preview: { host: "127.0.0.1", port: 5175, strictPort: true },
  build: {
    rolldownOptions: {
      input: path.resolve(import.meta.dirname, "landing.html"),
    },
  },
  test: {
    name: "landing",
    root: import.meta.dirname,
    setupFiles: ["../../packages/core/src/testing/setup.ts"],
  },
})
