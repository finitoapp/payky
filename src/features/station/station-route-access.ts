import type { FileRouteTypes } from "@/routeTree.gen.ts"

type RouteId = FileRouteTypes["id"]

/**
 * What a PoS station may open (station/0013): the keypad and the payment it
 * starts, its own history, and the settings that are the device's own. Every
 * other screen belongs to the owner.
 */
const stationRouteIds: ReadonlySet<RouteId> = new Set<RouteId>([
  "/_terminal/",
  "/_terminal/payment/tip",
  "/_terminal/payment_/$paymentId",
  "/_terminal/activity",
  "/_terminal/activity_/$paymentId",
  "/_terminal/settings/",
  "/_terminal/settings/language",
  "/_terminal/settings/theme",
  "/_terminal/settings/about/",
  "/_terminal/settings/about/privacy",
  "/_terminal/settings/about/terms",
])

/** Whether a station may show the route a navigation ended on. */
export const isRouteAllowedForStation = (routeId: RouteId): boolean =>
  stationRouteIds.has(routeId)
