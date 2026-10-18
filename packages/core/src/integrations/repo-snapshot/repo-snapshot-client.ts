import type { Task } from "@evolu/common"
import { z } from "zod"
import {
  type FetchDep,
  type FetchError,
  fetchAndValidateJson,
} from "../../deps.ts"
import { defineError } from "../../error.ts"

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
  (
    /** `repo-snapshot.json` of the deployment the app reads (ai/0003), absolute on native. */
    url: string
  ): Task<RepoSnapshot, RepoSnapshotError, FetchDep> =>
  (run) =>
    run(
      fetchAndValidateJson({
        url,
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
