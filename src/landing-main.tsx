import { installPolyfills } from "@evolu/common/polyfills"
import { StrictMode } from "react"
import { createRoot, hydrateRoot } from "react-dom/client"

import { LandingPage } from "@/features/landing/landing-page.tsx"
import { landingLanguageFromPath } from "@/features/shared/landing-redirect.ts"
import "@/index.css"

// The contact form's `await using` needs `Symbol.asyncDispose`.
installPolyfills()

const rootElement = document.getElementById("root")

if (rootElement === null) {
  throw new Error("Root element was not found.")
}

const page = (
  <StrictMode>
    <LandingPage language={landingLanguageFromPath(location.pathname)} />
  </StrictMode>
)

// The build prerenders the page (landing/0002); the dev server serves the
// template, whose root holds only the placeholder comment.
if (rootElement.firstElementChild !== null) {
  hydrateRoot(rootElement, page)
} else {
  createRoot(rootElement).render(page)
}
