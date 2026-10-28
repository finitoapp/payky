import type { ConsoleDep, LockManagerDep, Task } from "@evolu/common"
import type { CashuDeps } from "../cashu/cashu-wallet.ts"
import type {
  ConnectivityDep,
  DateDep,
  DeviceIdDep,
  EvoluOwnerDep,
  FetchDep,
} from "../deps.ts"
import type { EetApiDep } from "../integrations/eet/eet-client.ts"
import type { NostrDep } from "../integrations/nostr/nostr-client.ts"
import type { QerkoApiDep } from "../integrations/qerko/qerko-client.ts"
import type { EvoluDep } from "../modules/shared/evolu-deps.ts"

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
  EetApiDep &
  QerkoApiDep

/** What the app's own runs add for Payky's Cashu wallet (cashu/0012). */
export type CashuBackgroundJobContext = AppBackgroundJobContext &
  CashuDeps &
  NostrDep

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
