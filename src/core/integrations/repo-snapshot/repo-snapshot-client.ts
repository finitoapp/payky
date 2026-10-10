import type { Task } from "@evolu/common"
import { z } from "zod"
import { apiUrl } from "@/core/app-env.ts"
import {
  type FetchDep,
  type FetchError,
  fetchAndValidateJson,
} from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"

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
        // Only the web build carries it (ai/0003), so the native app reads
        // payky.me's.
        url: apiUrl("/repo-snapshot.json"),
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
