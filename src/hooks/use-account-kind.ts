import { useAtomValue } from "jotai"

import { accountAtom } from "@/atoms/account.ts"
import type { DeviceAccountKind } from "@/core/evolu/device-client.ts"

/** Whether the active account is the merchant's own or a PoS station. */
export const useAccountKind = (): DeviceAccountKind =>
  useAtomValue(accountAtom).kind

export const useIsStation = (): boolean => useAccountKind() === "station"
