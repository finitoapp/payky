import { id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const EmployeeIdRaw = id("Employee")
export const EmployeeId = standardSchemaToZod(EmployeeIdRaw)
export type EmployeeId = typeof EmployeeIdRaw.Output
