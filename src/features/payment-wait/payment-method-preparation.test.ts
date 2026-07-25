import { describe, expect, test } from "vitest"
import {
  clearPaymentMethodPreparation,
  createPaymentMethodPreparationRunner,
  failPaymentMethodPreparation,
  requestPaymentMethodPreparation,
  retryPaymentMethodPreparation,
} from "./payment-method-preparation.ts"

const sparkKey = "payment-1:spark:account-1"
const ibanKey = "payment-1:iban:account-2"

describe("payment method preparation state", () => {
  test("retains a failed preparation until retry", () => {
    const requested = requestPaymentMethodPreparation({}, sparkKey)
    const error = new Error("prepare failed")
    const failed = failPaymentMethodPreparation(
      requested.state,
      sparkKey,
      error
    )

    expect(failed[sparkKey]).toEqual({ status: "failed", error })
    expect(requestPaymentMethodPreparation(failed, sparkKey)).toEqual({
      state: failed,
      shouldPrepare: false,
    })
  })

  test("retry permits exactly one reattempt", () => {
    const failed = failPaymentMethodPreparation(
      requestPaymentMethodPreparation({}, sparkKey).state,
      sparkKey,
      new Error("prepare failed")
    )
    const retried = retryPaymentMethodPreparation(failed, sparkKey)

    expect(retried.shouldPrepare).toBe(true)
    expect(retried.state[sparkKey]).toEqual({ status: "preparing" })
    expect(retryPaymentMethodPreparation(retried.state, sparkKey)).toEqual({
      state: retried.state,
      shouldPrepare: false,
    })
  })

  test("persistent failure does not request another attempt", () => {
    const firstAttempt = requestPaymentMethodPreparation({}, sparkKey)
    const firstFailure = failPaymentMethodPreparation(
      firstAttempt.state,
      sparkKey,
      new Error("still failing")
    )
    const automaticRequest = requestPaymentMethodPreparation(
      firstFailure,
      sparkKey
    )

    expect(firstAttempt.shouldPrepare).toBe(true)
    expect(automaticRequest.shouldPrepare).toBe(false)
    expect(automaticRequest.state).toBe(firstFailure)
  })

  test("deduplicates replayed attempts and permits one retry after failure", async () => {
    const runner = createPaymentMethodPreparationRunner()
    let rejectAttempt: ((error: Error) => void) | undefined
    let attempts = 0
    const prepare = () => {
      attempts += 1
      return new Promise<void>((_resolve, reject) => {
        rejectAttempt = reject
      })
    }

    const firstRun = runner.run(sparkKey, prepare)
    const replayedRun = runner.run(sparkKey, prepare)

    expect(attempts).toBe(1)
    expect(replayedRun).toBe(firstRun)

    rejectAttempt?.(new Error("still failing"))
    await expect(firstRun).rejects.toThrow("still failing")

    const retryRun = runner.run(sparkKey, prepare)
    const replayedRetryRun = runner.run(sparkKey, prepare)

    expect(attempts).toBe(2)
    expect(replayedRetryRun).toBe(retryRun)

    rejectAttempt?.(new Error("still failing"))
    await expect(retryRun).rejects.toThrow("still failing")
  })

  test("keeps method keys isolated", () => {
    const sparkAttempt = requestPaymentMethodPreparation({}, sparkKey)
    const sparkFailure = failPaymentMethodPreparation(
      sparkAttempt.state,
      sparkKey,
      new Error("spark failed")
    )
    const ibanAttempt = requestPaymentMethodPreparation(sparkFailure, ibanKey)

    expect(ibanAttempt.shouldPrepare).toBe(true)
    expect(ibanAttempt.state[sparkKey]?.status).toBe("failed")
    expect(ibanAttempt.state[ibanKey]).toEqual({ status: "preparing" })

    const cleared = clearPaymentMethodPreparation(ibanAttempt.state, ibanKey)
    expect(cleared[sparkKey]?.status).toBe("failed")
    expect(cleared[ibanKey]).toBeUndefined()
  })
})
