import type { IndexesConfig } from "@evolu/common/local-first"
import { z } from "zod"

import { DeviceId } from "@/core/modules/device/device-types.ts"
import {
  type InferTable,
  NonEmptyString255Schema,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"

export const device = {
  id: DeviceId,
  name: NonEmptyString255Schema,
  deviceType: NonEmptyString255Schema.nullable(),
  browserName: NonEmptyString255Schema.nullable(),
  osName: NonEmptyString255Schema.nullable(),
  /**
   * What the device may do without the PIN, as `PermissionsJson`; `null` is
   * nothing (access/0004). Written only by whoever holds the PIN, never by
   * the device's own start-up upsert.
   */
  defaultPermissions: z.string().max(1000).nullable(),
  /** Set by the device itself when its PIN entry blocks (access/0006). */
  pinBlockedAt: TimestampMsSchema.nullable(),
  /** Written by an unblock from another device (access/0006). */
  pinUnblockToken: NonEmptyString255Schema.nullable(),
} as const

export const deviceIndexes = ((create) => [
  create("device_name").on("device").column("name"),
]) satisfies IndexesConfig

export type DeviceRow = InferTable<typeof device>
