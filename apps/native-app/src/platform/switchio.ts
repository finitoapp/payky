import { err } from "@evolu/common"
import {
  createSwitchioResultUnreadableError,
  createSwitchioUnavailableError,
  interpretSwitchioPaymentResult,
  type SwitchioNativePayResult,
  SwitchioNativePayResultSchema,
  type SwitchioTerminalDep,
} from "@payky/core/switchio"
import { NativeModule, requireOptionalNativeModule } from "expo"

/**
 * `modules/payky-switchio`: the SwitchioPay ECR API (v8) is driven entirely
 * through Android intents, so there is no iOS or web equivalent. The Android
 * half of web's `platform/switchio.ts`.
 */
declare class PaykySwitchioNativeModule extends NativeModule {
  isInstalled(): boolean
  pay(
    transactionId: string,
    amount: number,
    tipAmount: number,
    currencyCode: number,
    invoiceNumber: string | null
  ): Promise<unknown>
  peekStoredResult(): unknown
  acknowledgeResult(transactionId: string | null): void
}

/** Matched by the Kotlin module: the one rejection known to precede any charge. */
const SWITCHIO_NOT_INSTALLED_CODE = "SWITCHIO_NOT_INSTALLED"

// Absent in a binary built before the module existed.
const switchio =
  requireOptionalNativeModule<PaykySwitchioNativeModule>("PaykySwitchio")

/** Whether this device can launch SwitchioPay; `false` without the module. */
export const isSwitchioInstalled = (): boolean =>
  switchio?.isInstalled() === true

const isNotInstalledRejection = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === SWITCHIO_NOT_INSTALLED_CODE

const unreadable = () =>
  err(
    createSwitchioResultUnreadableError({ resultCode: null, rawResult: null })
  )

export const createSwitchioTerminalDep = (): SwitchioTerminalDep => ({
  switchioTerminal: {
    pay: async (request) => {
      if (switchio === null) {
        return err(
          createSwitchioUnavailableError({ reason: "notNativeRuntime" })
        )
      }

      // A result no one has settled yet belongs to an earlier attempt and
      // would be overwritten by this one: wait until it has been settled
      // (`SwitchioRestoredResult` does that at start-up).
      if (switchio.peekStoredResult() !== null) return unreadable()

      try {
        const raw = await switchio.pay(
          request.transactionId,
          request.amount,
          request.tipAmount,
          request.currencyCode,
          request.invoiceNumber ?? null
        )
        // The attempt's marker (`unresolvedTransactionId`) was stored before
        // the terminal was launched, so acknowledging here cannot lose
        // information: a crash before the outcome is recorded leaves the
        // attempt unresolved, never silently unpaid.
        switchio.acknowledgeResult(request.transactionId)
        const parsed = SwitchioNativePayResultSchema.safeParse(raw)
        return parsed.success
          ? interpretSwitchioPaymentResult(parsed.data)
          : unreadable()
      } catch (error) {
        // Only a missing SwitchioPay activity is known to fail before
        // anything was charged. Any other rejection (a dropped bridge call,
        // a recreated activity) may come after the terminal took the card,
        // so it is an unknown outcome, never "unavailable".
        if (isNotInstalledRejection(error)) {
          return err(createSwitchioUnavailableError({ reason: "notInstalled" }))
        }
        return unreadable()
      }
    },
  },
})

/**
 * The result of an attempt whose promise was lost when Android killed the
 * app, if one is waiting. Clears it first, so a result is settled at most
 * once by this path; `settleRestoredSwitchioCardPayment` is idempotent too.
 */
export const takeRestoredSwitchioResult = ():
  | SwitchioNativePayResult
  | "unusable"
  | null => {
  if (switchio === null) return null
  const stored = switchio.peekStoredResult()
  if (stored === null || stored === undefined) return null

  const parsed = SwitchioNativePayResultSchema.safeParse(stored)
  switchio.acknowledgeResult(parsed.success ? parsed.data.transactionId : null)
  return parsed.success ? parsed.data : "unusable"
}
