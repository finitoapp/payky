import "@/polyfills"

import { StrictMode, useEffect } from "react"
import { createRoot } from "react-dom/client"

import App from "@/App.tsx"
import "@/index.css"

const rootElement = document.getElementById("root")

if (rootElement == null) {
  throw new Error("Root element was not found.")
}

function AppWithLoaderCleanup() {
  useEffect(() => {
    const loader = document.getElementById("app-loader")

    if (loader == null) {
      return
    }

    loader.classList.add("is-hidden")

    const removeLoader = () => {
      loader.remove()
    }

    loader.addEventListener("transitionend", removeLoader, { once: true })
    const fallbackTimeoutId = window.setTimeout(removeLoader, 520)

    return () => {
      loader.removeEventListener("transitionend", removeLoader)
      window.clearTimeout(fallbackTimeoutId)
    }
  }, [])

  return <App />
}

createRoot(rootElement).render(
  <StrictMode>
    <AppWithLoaderCleanup />
  </StrictMode>
)
