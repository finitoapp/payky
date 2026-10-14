import type { ConsoleDep, LockManagerDep, Task } from "@evolu/common"
import type { CashuBookingDeps } from "@/core/cashu/cashu-booking.ts"
import type { CashuTokenListenerDeps } from "@/core/cashu/cashu-token-listener.ts"
import type { CashuTopupDeps } from "@/core/cashu/cashu-topup.ts"
import type {
  ConnectivityDep,
  DateDep,
  DeviceIdDep,
  EvoluOwnerDep,
  FetchDep,
} from "@/core/deps.ts"
import type { EetApiDep } from "@/core/integrations/eet/eet-client.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"

export interface BackgroundJobOnErrorDep {
  readonly onError: (error: unknown) => void
}

export type BackgroundJobContext = EvoluDep &
  EvoluOwnerDep &
  ConsoleDep &
  DateDep &
  FetchDep &
  LockManagerDep &
  BackgroundJobOnErrorDep

export type BackgroundJob = Task<AsyncDisposable, never, BackgroundJobContext>

export type AppBackgroundJobContext = BackgroundJobContext &
  DeviceIdDep &
  ConnectivityDep &
  EetApiDep

/** What the app's own runs add for the shared Cashu wallet. */
export type CashuBackgroundJobContext = AppBackgroundJobContext &
  CashuTopupDeps &
  CashuBookingDeps &
  CashuTokenListenerDeps

export type CashuBackgroundJob = Task<
  AsyncDisposable,
  never,
  CashuBackgroundJobContext
>

export type AppBackgroundJob = Task<
  AsyncDisposable,
  never,
  AppBackgroundJobContext
>
