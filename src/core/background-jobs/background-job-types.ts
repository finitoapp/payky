import type { ConsoleDep, LockManagerDep, Task } from "@evolu/common"
import type {
  ConnectivityDep,
  DateDep,
  DeviceIdDep,
  EvoluOwnerIdDep,
  FetchDep,
  MasterKeyDep,
  StationAccountDep,
} from "@/core/deps.ts"
import type { EetApiDep } from "@/core/integrations/eet/eet-client.ts"
import type { NostrDep } from "@/core/integrations/nostr/nostr-client.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import type {
  SparkSyncWalletDep,
  SparkWalletDep,
} from "@/core/spark/spark-wallet.ts"

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

/** The owner's side of talking to its PoS stations. */
export type OwnerStationJobContext = AppBackgroundJobContext &
  NostrDep &
  MasterKeyDep &
  SparkSyncWalletDep

export type OwnerStationJob = Task<
  AsyncDisposable,
  never,
  OwnerStationJobContext
>

/** A PoS station's own jobs; `masterKey` is the station's. */
export type StationJobContext = AppBackgroundJobContext &
  NostrDep &
  MasterKeyDep &
  SparkWalletDep &
  StationAccountDep

export type StationJob = Task<AsyncDisposable, never, StationJobContext>
