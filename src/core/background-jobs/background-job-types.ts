import type { ConsoleDep, LockManagerDep, Task } from "@evolu/common"
import type {
  ConnectivityDep,
  DateDep,
  DeviceIdDep,
  EvoluOwnerIdDep,
  FetchDep,
} from "@/core/deps.ts"
import type { EetApiDep } from "@/core/integrations/eet/eet-client.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"

export interface BackgroundJobOnErrorDep {
  readonly onError: (error: unknown) => void
}

export type BackgroundJobContext = EvoluDep &
  EvoluOwnerIdDep &
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

export type AppBackgroundJob = Task<
  AsyncDisposable,
  never,
  AppBackgroundJobContext
>
