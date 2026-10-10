import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import type { AnyRoute } from "@tanstack/react-router"
import { describe, expect, test } from "vitest"

import { router } from "@/router.tsx"

interface RouteNode {
  readonly id: string
  readonly access: unknown
  readonly hasLoader: boolean
  readonly ancestors: ReadonlyArray<{ readonly access: unknown }>
}

const isTerminal = (id: string) =>
  id === "/_terminal" || id.startsWith("/_terminal/")

const terminalRoutes = (): ReadonlyArray<RouteNode> =>
  Object.values(router.routesById as unknown as Record<string, AnyRoute>)
    .filter((route) => isTerminal(route.id))
    .map((route) => {
      const ancestors: Array<{ readonly access: unknown }> = []
      for (
        let parent: AnyRoute | undefined = route.parentRoute;
        parent !== undefined && isTerminal(parent.id);
        parent = parent.parentRoute
      ) {
        ancestors.push({ access: parent.options.staticData?.access })
      }
      return {
        id: route.id,
        access: route.options.staticData?.access,
        hasLoader: route.options.loader !== undefined,
        ancestors,
      }
    })

describe("_terminal route access (access/0003)", () => {
  const routes = terminalRoutes()

  test("finds the terminal routes", () => {
    expect(routes.length).toBeGreaterThan(40)
  })

  test("every route declares a permission or free, layouts included", () => {
    const undeclared = routes
      .filter(({ access }) => access === undefined)
      .map(({ id }) => id)

    expect(undeclared).toEqual([])
  })

  test("no free route sits under a layout that declares a permission", () => {
    const lockedFree = routes
      .filter(
        (route) =>
          route.access === "free" &&
          route.ancestors.some((ancestor) => ancestor.access !== "free")
      )
      .map(({ id }) => id)

    expect(lockedFree).toEqual([])
  })

  test("no route has a loader, which would run before the gate", () => {
    expect(
      routes.filter(({ hasLoader }) => hasLoader).map(({ id }) => id)
    ).toEqual([])
  })
})

/**
 * A route file is thin: it declares the route and hands the screen to a
 * feature `*Page`, which renders the whole page, header included. A route
 * drawing `FadeHeader` itself is a page written inline or a wrapper around a
 * feature component that is not a page after all.
 */
describe("route files stay thin", () => {
  const routesDir = path.join(import.meta.dirname, "routes")
  const routeFiles = readdirSync(routesDir).filter((file) =>
    file.endsWith(".tsx")
  )

  test("finds the route files", () => {
    expect(routeFiles.length).toBeGreaterThan(40)
  })

  test("no route renders the page header itself", () => {
    expect(
      routeFiles.filter((file) =>
        readFileSync(path.join(routesDir, file), "utf8").includes(
          "@/components/fade-header"
        )
      )
    ).toEqual([])
  })
})
