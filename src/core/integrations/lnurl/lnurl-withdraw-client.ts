import { err, ok, type Result, type Task } from "@evolu/common"
import { z } from "zod"
import type { FetchDep } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import {
  fetchLnurlJson,
  type LnurlError,
  MSATS_PER_SAT,
} from "@/core/integrations/lnurl/lnurl-client.ts"

const LnurlWithdrawRequestSchema = z.object({
  tag: z.literal("withdrawRequest"),
  callback: z.url(),
  k1: z.string().trim().min(1),
  minWithdrawable: z.number().int().nonnegative(),
  maxWithdrawable: z.number().int().nonnegative(),
})

const LnurlOkSchema = z.object({ status: z.literal("OK") })

/** The tag's URI is not an LNURL-withdraw link, so it is not a Bolt Card. */
const createLnurlWithdrawUnsupportedUriError = defineError(
  "LnurlWithdrawUnsupportedUri"
)<{
  readonly uri: string
}>()
export type LnurlWithdrawUnsupportedUriError = ReturnType<
  typeof createLnurlWithdrawUnsupportedUriError
>

const createLnurlWithdrawAmountOutOfRangeError = defineError(
  "LnurlWithdrawAmountOutOfRange"
)<{
  readonly amountSats: number
  readonly minWithdrawableMsats: number
  readonly maxWithdrawableMsats: number
}>()
export type LnurlWithdrawAmountOutOfRangeError = ReturnType<
  typeof createLnurlWithdrawAmountOutOfRangeError
>

export type RedeemLnurlWithdrawError =
  | LnurlWithdrawUnsupportedUriError
  | LnurlWithdrawAmountOutOfRangeError
  | LnurlError

/**
 * The HTTPS URL behind a Bolt Card's `lnurlw://` link (LUD-17). A plain
 * `https://` link is taken as is. Bech32 `LNURL1…` strings are not handled:
 * Bolt Cards write the LUD-17 scheme.
 */
export const lnurlWithdrawUrl = (
  uri: string
): Result<URL, LnurlWithdrawUnsupportedUriError> => {
  const trimmed = uri.trim()
  const httpsUri = trimmed.replace(/^lnurlw:\/\//i, "https://")

  if (!/^https:\/\//i.test(httpsUri) || !URL.canParse(httpsUri)) {
    return err(createLnurlWithdrawUnsupportedUriError({ uri: trimmed }))
  }

  return ok(new URL(httpsUri))
}

/**
 * Asks the LNURL-withdraw service behind `uri` to pay `invoice` (LUD-03):
 * reads the withdraw request, checks `amountSats` fits its limits, then hands
 * the invoice to its callback. `ok` means the service accepted the invoice,
 * not that it has been paid — settlement is observed by the wallet sync.
 */
export const redeemLnurlWithdraw =
  ({
    uri,
    invoice,
    amountSats,
  }: {
    readonly uri: string
    readonly invoice: string
    readonly amountSats: number
  }): Task<void, RedeemLnurlWithdrawError, FetchDep> =>
  async (run) => {
    const url = lnurlWithdrawUrl(uri)
    if (!url.ok) return url

    const request = await run(
      fetchLnurlJson(url.value, "LNURL withdraw", LnurlWithdrawRequestSchema)
    )
    if (!request.ok) return request

    const { callback, k1, minWithdrawable, maxWithdrawable } = request.value
    const amountMsats = amountSats * MSATS_PER_SAT
    if (amountMsats < minWithdrawable || amountMsats > maxWithdrawable) {
      return err(
        createLnurlWithdrawAmountOutOfRangeError({
          amountSats,
          minWithdrawableMsats: minWithdrawable,
          maxWithdrawableMsats: maxWithdrawable,
        })
      )
    }

    const callbackUrl = new URL(callback)
    callbackUrl.searchParams.set("k1", k1)
    callbackUrl.searchParams.set("pr", invoice)

    const accepted = await run(
      fetchLnurlJson(callbackUrl, "LNURL withdraw callback", LnurlOkSchema)
    )
    if (!accepted.ok) return accepted

    return ok()
  }
