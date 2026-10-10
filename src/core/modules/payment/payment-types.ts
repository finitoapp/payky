import { id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const PaymentIdRaw = id("Payment")
export const PaymentId = standardSchemaToZod(PaymentIdRaw)
export type PaymentId = typeof PaymentIdRaw.Output

export type PaymentStatus = "canceled" | "paid" | "expired" | "pending"

/**
 * The account kinds a payment can be settled against and whose currency must
 * therefore match the payment's own. Spark is absent on purpose: a BTC
 * wallet has no fiat currency to compare.
 */
export type PaymentAccountKind = "cashRegister" | "iban" | "cardSwitchio"
