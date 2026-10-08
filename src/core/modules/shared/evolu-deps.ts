import type { DeviceEvolu } from "@/core/evolu/device-client.ts"
import type { Evolu } from "@/core/evolu/schema.ts"

export interface EvoluDep {
  readonly evolu: Evolu
}

/** The device database: this device's accounts and settings, never synced. */
export interface DeviceEvoluDep {
  readonly deviceEvolu: DeviceEvolu
}
