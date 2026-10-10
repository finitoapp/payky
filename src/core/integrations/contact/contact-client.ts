import type { Task } from "@evolu/common"
import { z } from "zod"

import { apiUrl } from "@/core/app-env.ts"
import {
  type FetchDep,
  type FetchError,
  fetchAndValidateJson,
} from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import {
  type ContactMessage,
  ContactMessageSchema,
} from "@/core/modules/contact/contact-message.ts"
import { jsonCodec } from "@/zod-utils.ts"

const ContactMessageJson = jsonCodec(ContactMessageSchema)

const ContactResponseSchema = z.object({ status: z.literal("OK") })

const createContactHttpError = defineError("ContactHttpError")<{
  readonly message: string
  readonly status: number
  readonly responseBody: string
}>()
export type ContactHttpError = ReturnType<typeof createContactHttpError>

const createContactResponseError = defineError("ContactResponseError")<{
  readonly message: string
  readonly status: number
  readonly responseBody: string
  readonly cause?: unknown
}>()
export type ContactResponseError = ReturnType<typeof createContactResponseError>

export type ContactError = ContactHttpError | ContactResponseError | FetchError

/**
 * Hands the landing page's contact form to Payky's API, which passes it on
 * to the support team (support/0003). Ok once a relay accepted it for them.
 */
export const sendContactMessage =
  (
    contact: ContactMessage
  ): Task<z.output<typeof ContactResponseSchema>, ContactError, FetchDep> =>
  (run) =>
    run(
      fetchAndValidateJson({
        url: apiUrl("/api/contact"),
        init: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: z.encode(ContactMessageJson, contact),
        },
        schema: ContactResponseSchema,
        onHttpError: ({ status, responseBody }) =>
          createContactHttpError({
            message: `Contact request failed: ${status}`,
            status,
            responseBody,
          }),
        onResponseError: ({ status, responseBody, cause }) =>
          createContactResponseError({
            message: "Invalid contact response.",
            status,
            responseBody,
            cause,
          }),
      })
    )
