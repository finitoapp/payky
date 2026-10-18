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
  | "/bill"
  | "/payment/tip"
  | "/payment/:paymentId"
  | "/activity"
  | "/activity/bills"
  | "/activity/bills/:billId"
  | "/activity/:paymentId"
  | "/withdraw"
  | "/withdraw/new"
  | "/withdraw/:withdrawalId"
  | "/cashu-withdraw"
  | "/cashu-withdraw/new"
  | "/cashu-withdraw/:withdrawalId"
  | "/settings"
  | "/settings/language"
  | "/settings/theme"
  | "/settings/home-screen"
  | "/settings/profile"
  | "/settings/legal-entity"
  | "/settings/tax-rates"
  | "/settings/tips"
  | "/settings/payment-number-series"
  | "/settings/items"
  | "/settings/items/new"
  | "/settings/items/:catalogItemId"
  | "/settings/categories"
  | "/settings/categories/new"
  | "/settings/categories/:catalogCategoryId"
  | "/settings/tables"
  | "/settings/tables/new"

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
  // Like web's `_terminal/bill` (access/0002: the bill is `sell`).
  "/bill": "sell",
  // Like web's `_terminal/payment/tip` and `payment_/$paymentId`.
  "/payment/tip": "sell",
  "/payment/:paymentId": "sell",
  // Like web's `_terminal/activity` routes (access/0002: history is `activity`).
  "/activity": "activity",
  "/activity/bills": "activity",
  "/activity/bills/:billId": "activity",
  "/activity/:paymentId": "activity",
  // Like web's Spark `withdrawals` routes (access/0002: owner-only).
  "/withdraw": "admin",
  "/withdraw/new": "admin",
  "/withdraw/:withdrawalId": "admin",
  // Like web's Cashu `withdrawals` routes: the same owner-only gate (access/0002).
  "/cashu-withdraw": "admin",
  "/cashu-withdraw/new": "admin",
  "/cashu-withdraw/:withdrawalId": "admin",
  // Like web's `_terminal/settings/` index: the menu is free, each destination has its own gate.
  "/settings": "free",
  // Like web's `_terminal/settings/language`.
  "/settings/language": "free",
  // Like web's `_terminal/settings/theme`.
  "/settings/theme": "free",
  // Like web's `_terminal/settings/home-screen`: the modes are a business choice.
  "/settings/home-screen": "settings",
  // Like web's `_terminal/settings/profile`: the public profile is owner-only (access/0002).
  "/settings/profile": "admin",
  // Like web's `_terminal/settings/legal-entity` (access/0002: `settings`).
  "/settings/legal-entity": "settings",
  // Like web's `_terminal/settings/tax-rates` (access/0002: `settings`).
  "/settings/tax-rates": "settings",
  // Like web's `_terminal/settings/tips` (access/0002: `settings`).
  "/settings/tips": "settings",
  // Like web's `_terminal/settings/payment-number-series` (access/0002: `settings`).
  "/settings/payment-number-series": "settings",
  // Like web's `_terminal/settings/items` (access/0002: `settings`).
  "/settings/items": "settings",
  // Like web's `_terminal/settings/items/new`.
  "/settings/items/new": "settings",
  // Like web's `_terminal/settings/items/$catalogItemId`.
  "/settings/items/:catalogItemId": "settings",
  // Like web's `_terminal/settings/categories` (access/0002: `settings`).
  "/settings/categories": "settings",
  // Like web's `_terminal/settings/categories/new`.
  "/settings/categories/new": "settings",
  // Like web's `_terminal/settings/categories/$catalogCategoryId`.
  "/settings/categories/:catalogCategoryId": "settings",
  // Like web's `_terminal/settings/tables` (access/0002: `settings`).
  "/settings/tables": "settings",
  // Like web's `_terminal/settings/tables/new`.
  "/settings/tables/new": "settings",
  // Like web's /error: a deliberate crash with no gate in front of it.
  "/error": "free",
} satisfies Record<NativeRoutePath, RouteAccess>

const table: Readonly<Record<string, RouteAccess>> = routeAccess

/** `/payment/:paymentId` matches `/payment/abc`: a `:param` is any one segment. */
const matchesPattern = (pattern: string, pathname: string): boolean => {
  const want = pattern.split("/")
  const got = pathname.split("/")
  return (
    want.length === got.length &&
    want.every((part, i) =>
      part.startsWith(":") ? got[i] !== "" : part === got[i]
    )
  )
}

/**
 * Fail closed: a path missing from the table needs the owner permission. An
 * exact entry wins over a `:param` pattern, as Expo Router ranks a static
 * route above a dynamic one (`/payment/tip` over `/payment/:paymentId`, `/activity/bills` over `/activity/:paymentId`).
 */
export const resolveRouteAccess = (pathname: string): RouteAccess =>
  table[pathname] ??
  Object.entries(table).find(([pattern]) =>
    matchesPattern(pattern, pathname)
  )?.[1] ??
  "admin"

export const requiredPermission = (pathname: string): Permission | null => {
  const access = resolveRouteAccess(pathname)
  return access === "free" ? null : access
}
