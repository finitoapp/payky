import { useEffect } from "react"

/**
 * Rendered as a child of the root Suspense boundary (not an ancestor), so its
 * effect only fires once the real app UI has actually mounted — not merely
 * when the boundary's fallback commits.
 */
export function AppLoaderCleanup() {
  useEffect(() => {
    const loader = document.getElementById("app-loader")

    if (loader === null) {
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

  return null
}
