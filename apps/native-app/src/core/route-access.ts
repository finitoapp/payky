import type {
  Permission,
  RouteAccess,
} from "@payky/core/modules/access/access-types"

export type NativeRoutePath =
  | "/"
  | "/diagnostics"
  | "/error"
  | "/pair"
  | "/onboarding"
  | "/restore-account"

/**
 * What each Expo Router path needs (access/0003); `route-access.test.ts`
 * keeps it in step with `app/`. `/` is the terminal home and needs `sell`
 * like web's `_terminal/` index (access/0002); `/diagnostics` and `/pair`
 * are owner-level until R03 replaces them. No route group exists yet; when one does, add the
 * "a `free` child under a gated group fails" check to the test (access/0003).
 */
export const routeAccess = {
  "/": "sell",
  "/diagnostics": "admin",
  "/pair": "admin",
  // Like web's /onboarding, outside the gated `_terminal` layout: a fresh
  // account has no PIN yet.
  "/onboarding": "free",
  // Like web's /restore-account, a sibling of /onboarding outside `_terminal`.
  "/restore-account": "free",
  // Like web's /error: a deliberate crash with no gate in front of it.
  "/error": "free",
} satisfies Record<NativeRoutePath, RouteAccess>

/** Fail closed: a path missing from the table needs the owner permission. */
export const resolveRouteAccess = (pathname: string): RouteAccess =>
  (routeAccess as Readonly<Record<string, RouteAccess>>)[pathname] ?? "admin"

export const requiredPermission = (pathname: string): Permission | null => {
  const access = resolveRouteAccess(pathname)
  return access === "free" ? null : access
}
