import type { Query, QueryRows, Row } from "@evolu/common"
import { useAtomValue } from "jotai"
import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import type { DeviceEvoluSchema } from "@/core/evolu/device-client.ts"
import { useEvoluQueryFor } from "@/hooks/use-evolu-query-for.ts"

export const useDeviceEvoluQuery = <R extends Row>(
  query: Query<DeviceEvoluSchema, R>
): { data: QueryRows<R> } =>
  useEvoluQueryFor(useAtomValue(deviceEvoluAtom), query)
