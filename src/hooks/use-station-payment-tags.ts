import { activeEmployeesQuery } from "@/core/modules/employee/employee-queries.ts"
import type { EmployeeId } from "@/core/modules/employee/employee-types.ts"
import {
  currentEmployeeQuery,
  stationConfigQuery,
} from "@/core/modules/station/station-queries.ts"
import type { StationId } from "@/core/modules/station/station-types.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"

export interface StationPaymentTags {
  readonly stationId: StationId
  readonly employeeId: EmployeeId | null
  /** The owner keeps employees, so a payment must name one (station/0009). */
  readonly employeeRequired: boolean
}

/**
 * What a payment taken at this PoS station is tagged with; `null` on an
 * owner account, or a station still waiting for its first config.
 */
export const useStationPaymentTags = (): StationPaymentTags | null => {
  const [config] = useEvoluQuery(stationConfigQuery).data
  const [currentEmployee] = useEvoluQuery(currentEmployeeQuery).data
  const employees = useEvoluQuery(activeEmployeesQuery).data
  if (config === undefined) return null

  return {
    stationId: config.stationId,
    employeeId: currentEmployee?.id ?? null,
    employeeRequired: employees.length > 0,
  }
}
