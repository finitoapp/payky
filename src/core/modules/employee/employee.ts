import { EmployeeId } from "@/core/modules/employee/employee-types.ts"
import {
  type InferTable,
  NonEmptyString255Schema,
} from "@/core/modules/shared/schema.ts"

/**
 * Who takes a payment at a PoS station: one list the owner keeps, mirrored to
 * every station with the same ids (station/0009).
 */
export const employee = {
  id: EmployeeId,
  name: NonEmptyString255Schema,
} as const

export type EmployeeRow = InferTable<typeof employee>
