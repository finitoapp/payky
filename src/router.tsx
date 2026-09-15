import { createRouter } from "@tanstack/react-router"

import { routeTree } from "@/routeTree.gen.ts"

const normalizePath = (pathname: string | undefined) =>
  pathname?.replace(/\/$/, "") || "/"

/**
 * Stacks that push and pop from home. Depth inside one of them decides the
 * direction, so every `/settings/*` and `/activity/*` level animates the same
 * way its root does.
 *
 * Deliberately not listed: `/bill` and `/payment/*`. They sit on the money
 * path, walked dozens of times a shift, and a view transition cannot be
 * interrupted the way the platform's own animation can — 450ms of dead input
 * per step is a worse trade there than an instant swap.
 */
const stackRoots = ["/settings", "/activity"]

/** `/` is the floor of every stack; anything outside one has no depth. */
const stackDepth = (pathname: string) => {
  if (pathname === "/") return 0

  const inStack = stackRoots.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`)
  )

  return inStack ? pathname.split("/").length - 1 : undefined
}

export const router = createRouter({
  routeTree,
  // Android-style slide between screens, driven by CSS in index.css. Anything
  // that is not a push or a pop within one stack returns false and swaps
  // instantly, as before — including every `replace: true` navigation, which
  // has nothing to go back to.
  defaultViewTransition: {
    types: ({ fromLocation, toLocation }) => {
      const from = stackDepth(normalizePath(fromLocation?.pathname))
      const to = stackDepth(normalizePath(toLocation.pathname))

      if (from === undefined || to === undefined || from === to) return false

      return to > from ? ["forward"] : ["backward"]
    },
  },
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }

  interface StaticDataRouteOption {
    readonly terminalLayout?: {
      readonly mainClassName?: string
      readonly viewportClassName?: string
    }
  }
}
