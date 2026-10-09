import { createIdFromString } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"

import { deriveManualReconciliationClaimId } from "./reconciliation-claim-utils.ts"

describe("deriveManualReconciliationClaimId", () => {
  // An idempotency key already stored on devices: changing the string adds a
  // second claim for every movement confirmed before it.
  test("keeps the manual claim id stable", () => {
    expect(
      deriveManualReconciliationClaimId(
        "payment" as PaymentId,
        "transaction" as AccountTransactionId
      )
    ).toBe(createIdFromString("reconciliationClaim:manual:payment:transaction"))
  })
})
