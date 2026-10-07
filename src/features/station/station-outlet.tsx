import { Navigate, Outlet, useMatches } from "@tanstack/react-router"

import { EmployeePickerDialog } from "@/features/station/employee-picker-dialog.tsx"
import { isRouteAllowedForStation } from "@/features/station/station-route-access.ts"

/**
 * The terminal's outlet on a PoS station: an owner-only screen sends the
 * station home instead (station/0011), and the "who's selling" picker is
 * hosted here so every station screen can open it.
 */
export function StationOutlet() {
  const leafRouteId = useMatches({
    select: (matches) => matches.at(-1)?.routeId,
  })

  if (leafRouteId === undefined || !isRouteAllowedForStation(leafRouteId)) {
    return <Navigate to="/" replace />
  }

  return (
    <>
      <Outlet />
      <EmployeePickerDialog />
    </>
  )
}
