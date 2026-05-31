import type { ConsoleDep, Task } from "@evolu/common"

import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"

export interface BackgroundJobOnErrorDep {
  readonly onError: (error: unknown) => void
}

export type BackgroundJobContext = EvoluDep &
  ConsoleDep &
  BackgroundJobOnErrorDep

export type BackgroundJob = Task<Disposable, never, BackgroundJobContext>
