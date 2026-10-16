import { SqliteBoolean } from "@evolu/common"
import { z } from "zod"
import type { InferTable } from "../shared/schema.ts"
import { AccessControlId } from "./access-types.ts"

/**
 * The account's one access-control row (access/0001), at `accessControlId`.
 * `pin` holds salt, iteration count and hash together as `PinHashJson`, since
 * Evolu resolves each column on its own: two columns written by two devices
 * could merge into a pair that verifies nothing.
 */
export const accessControl = {
  id: AccessControlId,
  enabled: SqliteBoolean,
  pin: z.string().max(1000),
} as const

export type AccessControlRow = InferTable<typeof accessControl>
