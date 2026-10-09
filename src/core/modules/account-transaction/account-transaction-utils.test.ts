import { createIdFromString } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { AccountId } from "@/core/modules/account/account-types.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import type { RefundId } from "@/core/modules/refund/refund-types.ts"

import {
  deriveCashRefundAccountTransactionId,
  deriveManualPaymentAccountTransactionId,
} from "./account-transaction-utils.ts"

const paymentId = "payment" as PaymentId
const accountId = "account" as AccountId

// These ids are idempotency keys already stored on devices: any change to the
// strings records a second movement for every payment confirmed before it.
describe("deriveManualPaymentAccountTransactionId", () => {
  test.each([
    ["cashRegister", "accountTransaction:cashRegister:payment:payment:account"],
    ["iban", "accountTransaction:iban:manual:payment:payment:account"],
    ["cardSwitchio", "accountTransaction:cardSwitchio:payment:payment:account"],
  ] as const)("keeps the %s id stable", (accountKind, source) => {
    expect(
      deriveManualPaymentAccountTransactionId({
        accountKind,
        paymentId,
        accountId,
      })
    ).toBe(createIdFromString(source))
  })
})

describe("deriveCashRefundAccountTransactionId", () => {
  test("keeps the cash refund id stable", () => {
    expect(deriveCashRefundAccountTransactionId("refund" as RefundId)).toBe(
      createIdFromString("accountTransaction:cashRegister:refund:refund")
    )
  })
})
