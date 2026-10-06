import { Capacitor } from "@capacitor/core"
import type { Task } from "@evolu/common"
import { z } from "zod"
import { appEnv } from "@/core/app-env.ts"
import {
  type FetchDep,
  type FetchError,
  fetchAndValidateJson,
} from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"

/**
 * The snapshot only the web build carries (ai/0003): the web reads its own
 * deployment's, the native app, which has none, the one of payky.me.
 */
const repoSnapshotUrl = (): string =>
  Capacitor.isNativePlatform()
    ? new URL("/repo-snapshot.json", appEnv.VITE_PAYKY_API_BASE_URL).toString()
    : "/repo-snapshot.json"

const RepoSnapshotSchema = z.object({
  /** The version the snapshot was built from, as `__APP_VERSION__`. */
  version: z.string(),
  /** The text of every file, by its path in the repository. */
  files: z.record(z.string(), z.string()),
})
export type RepoSnapshot = z.output<typeof RepoSnapshotSchema>

const createRepoSnapshotHttpError = defineError("RepoSnapshotHttpError")<{
  readonly message: string
  readonly status: number
  readonly responseBody: string
}>()
export type RepoSnapshotHttpError = ReturnType<
  typeof createRepoSnapshotHttpError
>

const createRepoSnapshotResponseError = defineError(
  "RepoSnapshotResponseError"
)<{
  readonly message: string
  readonly status: number
  readonly responseBody: string
  readonly cause?: unknown
}>()
export type RepoSnapshotResponseError = ReturnType<
  typeof createRepoSnapshotResponseError
>

export type RepoSnapshotError =
  | RepoSnapshotHttpError
  | RepoSnapshotResponseError
  | FetchError

export const fetchRepoSnapshot =
  (): Task<RepoSnapshot, RepoSnapshotError, FetchDep> => (run) =>
    run(
      fetchAndValidateJson({
        url: repoSnapshotUrl(),
        schema: RepoSnapshotSchema,
        onHttpError: ({ status, responseBody }) =>
          createRepoSnapshotHttpError({
            message: `Repository snapshot request failed: ${status}`,
            status,
            responseBody,
          }),
        onResponseError: ({ status, responseBody, cause }) =>
          createRepoSnapshotResponseError({
            message: "Invalid repository snapshot.",
            status,
            responseBody,
            cause,
          }),
      })
    )
