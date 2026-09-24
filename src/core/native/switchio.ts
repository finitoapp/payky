import { Capacitor, registerPlugin } from "@capacitor/core"
import { err, ok, type Result } from "@evolu/common"
import { z } from "zod"

import { defineError } from "@/core/error.ts"

/**
 * Bridge to the SwitchioPay terminal app's ECR API (v8), which is driven
 * entirely through Android intents — there is no HTTP or local-socket
 * interface — so this only works inside the Capacitor Android runtime. The
 * native side lives in `android/app/src/main/java/me/payky/SwitchioPlugin.java`.
 */
interface SwitchioNativePlugin {
  isInstalled(): Promise<{ readonly installed: boolean }>
  pay(options: {
    readonly transactionId: string
    readonly amount: number
    readonly tipAmount: number
    readonly currencyCode: number
    readonly invoiceNumber?: string
  }): Promise<SwitchioNativePayResult>
}

/**
 * What the native `payResult` callback resolves with. Also the `data` of a
 * Capacitor `appRestoredResult` event when Android killed this app while
 * SwitchioPay was in the foreground — `transactionId` echoes the request's,
 * so a restored result can be matched to its payment. The event's `data` is
 * untyped, hence a schema rather than a bare interface.
 */
export const SwitchioNativePayResultSchema = z.object({
  resultCode: z.number(),
  transactionResult: z.string().nullable().default(null),
  transactionId: z.string().nullable().default(null),
})
export type SwitchioNativePayResult = z.output<
  typeof SwitchioNativePayResultSchema
>

/** The Capacitor plugin name and the rejection code for a missing app. */
export const SWITCHIO_PLUGIN_NAME = "Switchio"
const SWITCHIO_NOT_INSTALLED_CODE = "SWITCHIO_NOT_INSTALLED"

const SwitchioNative =
  registerPlugin<SwitchioNativePlugin>(SWITCHIO_PLUGIN_NAME)

/**
 * Bundle result codes returned by the SwitchioPay activity, per ECR API
 * section 3.3.
 */
const switchioResultCode = {
  success: -1,
  failure: 0,
  initFailure: 1,
  terminalBusy: 2,
} as const

/**
 * The subset of the ECR v8 transaction result this app keeps. Every field is
 * documented as optional, so all of them are read leniently; unknown fields
 * are dropped by zod.
 */
const SwitchioTransactionResultSchema = z.object({
  transactionId: z.string().nullish(),
  responseCode: z.string().nullish(),
  responseMessage: z.string().nullish(),
  authCode: z.string().nullish(),
  sequenceNumber: z.string().nullish(),
  pan: z.string().nullish(),
  appLabel: z.string().nullish(),
  brand: z.string().nullish(),
  terminalIdAcquirer: z.string().nullish(),
  dateTimeTerminal: z.string().nullish(),
})

const createSwitchioUnavailableError = defineError("SwitchioUnavailable")<{
  readonly reason: "notNativeRuntime" | "notInstalled"
}>()
export type SwitchioUnavailableError = ReturnType<
  typeof createSwitchioUnavailableError
>

const createSwitchioPaymentFailedError = defineError("SwitchioPaymentFailed")<{
  readonly resultCode: number
  readonly responseCode: string | null
  readonly responseMessage: string | null
}>()
export type SwitchioPaymentFailedError = ReturnType<
  typeof createSwitchioPaymentFailedError
>

/**
 * The outcome of the terminal transaction is unknown: it reported success
 * but its payload could not be read, or the bridge call failed after the
 * intent may already have left (`resultCode` is then `null`). Kept separate
 * from {@link SwitchioPaymentFailedError} on purpose: the card may well have
 * been charged, so this must never be shown as "declined" — staff has to
 * verify the transaction in the SwitchioPay app.
 */
const createSwitchioResultUnreadableError = defineError(
  "SwitchioResultUnreadable"
)<{
  readonly resultCode: number | null
  readonly rawResult: string | null
}>()
export type SwitchioResultUnreadableError = ReturnType<
  typeof createSwitchioResultUnreadableError
>

export type SwitchioPaymentError =
  | SwitchioUnavailableError
  | SwitchioPaymentFailedError
  | SwitchioResultUnreadableError

export interface SwitchioCardPaymentResult {
  readonly responseCode: string | null
  readonly authCode: string | null
  readonly sequenceNumber: string | null
  readonly maskedPan: string | null
  readonly cardLabel: string | null
  readonly terminalId: string | null
  readonly terminalDateTime: string | null
}

const optionalString = (value: string | null | undefined): string | null =>
  value === null || value === undefined || value === "" ? null : value

/**
 * Turns one intent result into a domain Result.
 *
 * Success requires the documented success result code *and* a
 * `responseCode` that is either the terminal's `"OK"` or absent — the field
 * is optional in the ECR result structure, so a terminal that omits it must
 * still be able to complete a payment, while an explicit non-`OK` code
 * always means the transaction did not go through.
 */
export const interpretSwitchioPaymentResult = ({
  resultCode,
  transactionResult,
}: {
  readonly resultCode: number
  readonly transactionResult: string | null
}): Result<SwitchioCardPaymentResult, SwitchioPaymentError> => {
  const parsed = ((): z.output<
    typeof SwitchioTransactionResultSchema
  > | null => {
    if (transactionResult === null || transactionResult === "") return null

    try {
      const result = SwitchioTransactionResultSchema.safeParse(
        JSON.parse(transactionResult)
      )
      return result.success ? result.data : null
    } catch {
      return null
    }
  })()

  if (resultCode !== switchioResultCode.success) {
    return err(
      createSwitchioPaymentFailedError({
        resultCode,
        responseCode: optionalString(parsed?.responseCode),
        responseMessage: optionalString(parsed?.responseMessage),
      })
    )
  }

  if (parsed === null) {
    return err(
      createSwitchioResultUnreadableError({
        resultCode,
        rawResult: transactionResult,
      })
    )
  }

  const responseCode = optionalString(parsed.responseCode)
  if (responseCode !== null && responseCode !== "OK") {
    return err(
      createSwitchioPaymentFailedError({
        resultCode,
        responseCode,
        responseMessage: optionalString(parsed.responseMessage),
      })
    )
  }

  return ok({
    responseCode,
    authCode: optionalString(parsed.authCode),
    sequenceNumber: optionalString(parsed.sequenceNumber),
    maskedPan: optionalString(parsed.pan),
    cardLabel: optionalString(parsed.appLabel) ?? optionalString(parsed.brand),
    terminalId: optionalString(parsed.terminalIdAcquirer),
    terminalDateTime: optionalString(parsed.dateTimeTerminal),
  })
}

/** Whether this device can launch SwitchioPay; always `false` outside the native app. */
export const isSwitchioInstalled = async (): Promise<boolean> =>
  Capacitor.isNativePlatform() && (await SwitchioNative.isInstalled()).installed

const isNotInstalledRejection = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === SWITCHIO_NOT_INSTALLED_CODE

export interface SwitchioTerminalDep {
  readonly switchioTerminal: {
    readonly pay: (request: {
      readonly transactionId: string
      readonly amount: number
      readonly tipAmount: number
      readonly currencyCode: number
      readonly invoiceNumber?: string
    }) => Promise<Result<SwitchioCardPaymentResult, SwitchioPaymentError>>
  }
}

export const createSwitchioTerminalDep = (): SwitchioTerminalDep => ({
  switchioTerminal: {
    pay: async (request) => {
      if (!Capacitor.isNativePlatform()) {
        return err(
          createSwitchioUnavailableError({ reason: "notNativeRuntime" })
        )
      }

      try {
        return interpretSwitchioPaymentResult(await SwitchioNative.pay(request))
      } catch (error) {
        // Only a missing SwitchioPay activity is known to fail before
        // anything was charged. Any other rejection (a dropped bridge call,
        // a recreated activity) may come after the terminal took the card,
        // so it is reported as an unknown outcome, never as "unavailable".
        if (isNotInstalledRejection(error)) {
          return err(createSwitchioUnavailableError({ reason: "notInstalled" }))
        }
        return err(
          createSwitchioResultUnreadableError({
            resultCode: null,
            rawResult: null,
          })
        )
      }
    },
  },
})
