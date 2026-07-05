import { App as CapacitorApp } from "@capacitor/app"
import { Capacitor } from "@capacitor/core"
import { useEffect } from "react"

import { getNativeRuntime } from "@/core/native/runtime.ts"
import { router } from "@/router.tsx"

const rootPathnames = new Set(["/", "/onboarding"])

interface HTMLElementWithPopover extends HTMLElement {
  hidePopover: () => void
}

function hasHidePopover(
  element: HTMLElement
): element is HTMLElementWithPopover {
  return "hidePopover" in element && typeof element.hidePopover === "function"
}

function findOpenPopover(): HTMLElement | null {
  try {
    return document.querySelector<HTMLElement>("[popover]:popover-open")
  } catch {
    return null
  }
}

function closeTopLayerElement() {
  const dialog = document.querySelector<HTMLDialogElement>("dialog[open]")

  if (dialog) {
    dialog.close()
    return true
  }

  const popover = findOpenPopover()

  if (popover && hasHidePopover(popover)) {
    popover.hidePopover()
    return true
  }

  return false
}

function hasMeaningfulFallbackRoute() {
  return !rootPathnames.has(router.history.location.pathname)
}

export function NativeBackButtonHandler() {
  useEffect(() => {
    if (
      getNativeRuntime() !== "capacitor" ||
      Capacitor.getPlatform() !== "android"
    ) {
      return undefined
    }

    let disposed = false
    const listener = CapacitorApp.addListener("backButton", async () => {
      if (closeTopLayerElement()) {
        return
      }

      if (router.history.canGoBack()) {
        router.history.back()
        return
      }

      if (hasMeaningfulFallbackRoute()) {
        await router.navigate({ to: "/", replace: true })
        return
      }

      await CapacitorApp.exitApp()
    })

    return () => {
      disposed = true
      void (async () => {
        const handle = await listener
        if (disposed) {
          void handle.remove()
        }
      })()
    }
  }, [])

  return null
}
