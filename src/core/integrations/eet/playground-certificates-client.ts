import { err, ok, type Task } from "@evolu/common"
import { z } from "zod"

import { appEnv } from "@/core/app-env.ts"
import {
  type DateDep,
  type FetchDep,
  type FetchError,
  fetchAndValidateJson,
} from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import { EetBase64Schema } from "@/core/modules/eet/eet-types.ts"
import { eetBase64ToBytes } from "@/core/modules/eet/eet-utils.ts"
import {
  type EetCertificateError,
  type EetCertificateFile,
  readEetCertificateFile,
} from "./eet-certificate.ts"

const PLAYGROUND_CERTIFICATES_URL = new URL(
  "/api/eet/playground-certificates",
  appEnv.VITE_PAYKY_API_BASE_URL
).toString()

const PlaygroundCertificatesResponseSchema = z.object({
  password: z.string().min(1),
  certificates: z
    .array(z.object({ fileName: z.string(), p12Base64: EetBase64Schema }))
    .min(1),
})

const createPlaygroundCertificatesHttpError = defineError(
  "PlaygroundCertificatesHttpError"
)<{
  readonly message: string
  readonly status: number
  readonly responseBody: string
}>()
export type PlaygroundCertificatesHttpError = ReturnType<
  typeof createPlaygroundCertificatesHttpError
>

const createPlaygroundCertificatesResponseError = defineError(
  "PlaygroundCertificatesResponseError"
)<{
  readonly message: string
  readonly status: number
  readonly responseBody: string
  readonly cause?: unknown
}>()
export type PlaygroundCertificatesResponseError = ReturnType<
  typeof createPlaygroundCertificatesResponseError
>

const createPlaygroundCertificateUnreadableError = defineError(
  "PlaygroundCertificateUnreadableError"
)<{ readonly reason: EetCertificateError["type"] }>()
export type PlaygroundCertificateUnreadableError = ReturnType<
  typeof createPlaygroundCertificateUnreadableError
>

export type PlaygroundCertificatesError =
  | PlaygroundCertificatesHttpError
  | PlaygroundCertificatesResponseError
  | PlaygroundCertificateUnreadableError
  | FetchError

export const fetchPlaygroundCertificates =
  (): Task<
    ReadonlyArray<EetCertificateFile>,
    PlaygroundCertificatesError,
    FetchDep & DateDep
  > =>
  async (run) => {
    const response = await run(
      fetchAndValidateJson({
        url: PLAYGROUND_CERTIFICATES_URL,
        schema: PlaygroundCertificatesResponseSchema,
        onHttpError: ({ status }) =>
          createPlaygroundCertificatesHttpError({
            message: `Official EET test certificates request failed: ${status}`,
            status,
            responseBody: "",
          }),
        onResponseError: ({ status, cause }) =>
          createPlaygroundCertificatesResponseError({
            message: "Invalid official EET test certificates response.",
            status,
            responseBody: "",
            cause,
          }),
      })
    )
    if (!response.ok) return response

    const { password, certificates } = response.value
    const now = run.deps.date.now()
    const files: EetCertificateFile[] = []
    for (const { p12Base64 } of certificates) {
      const file = await readEetCertificateFile({
        file: eetBase64ToBytes(p12Base64),
        password,
        now,
      })
      if (!file.ok) {
        return err(
          createPlaygroundCertificateUnreadableError({
            reason: file.error.type,
          })
        )
      }
      files.push(file.value)
    }

    return ok(files)
  }
