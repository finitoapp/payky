import type { Query, QueryRows, Row } from "@evolu/common"
import { useEvoluQueryFor } from "@payky/app-shared/use-evolu-query-for"
import type { DeviceEvoluSchema } from "@payky/core/evolu/device-client"
import type { EvoluSchema } from "@payky/core/evolu/schema"
import { useAtomValue } from "jotai"
import { deviceEvoluAtom } from "../atoms/device-evolu.ts"
import { evoluAtom } from "../atoms/evolu.ts"

export const useEvoluQuery = <R extends Row>(
  query: Query<EvoluSchema, R>
): { data: QueryRows<R> } => useEvoluQueryFor(useAtomValue(evoluAtom), query)

export const useDeviceEvoluQuery = <R extends Row>(
  query: Query<DeviceEvoluSchema, R>
): { data: QueryRows<R> } =>
  useEvoluQueryFor(useAtomValue(deviceEvoluAtom), query)
