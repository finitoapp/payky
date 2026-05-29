import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"

export interface BackgroundJobOnErrorDep {
  readonly onError: (error: unknown) => void
}

export type BackgroundJobContext = EvoluDep & BackgroundJobOnErrorDep

export type BackgroundJob = (context: BackgroundJobContext) => Disposable
