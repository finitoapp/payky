/**
 * Writes the landing page prerendered in every language (landing/0002) from
 * the client build's `dist/landing.html` and the server bundle
 * `vite build --ssr src/landing-server.tsx` leaves in `dist-ssr`. The
 * template itself is removed, so only the filled pages are served.
 */
import { readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const templatePath = path.join(root, "dist/landing.html")
const serverBundlePath = path.join(root, "dist-ssr/landing-server.js")

const {
  landingLanguages,
  renderLandingDocument,
}: typeof import("../src/landing-server.tsx") = await import(serverBundlePath)

const template = readFileSync(templatePath, "utf8")

for (const language of landingLanguages) {
  writeFileSync(
    path.join(root, `dist/landing-${language}.html`),
    renderLandingDocument(template, language)
  )
}

rmSync(templatePath)
rmSync(path.join(root, "dist-ssr"), { recursive: true, force: true })
