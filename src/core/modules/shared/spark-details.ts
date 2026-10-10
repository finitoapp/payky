/**
 * A Spark money movement's base row plus its optional Lightning invoice
 * and/or Spark invoice detail, shared by payment and account-transaction
 * insert/update input types.
 *
 * Kept out of `spark-wallet.ts`: that file wraps the Spark SDK, while this
 * describes how domain insert actions accept the details before anything
 * reaches the wallet.
 */
export type WithSparkDetails<TBase, TLightning, TSparkInvoice> = TBase & {
  readonly lightning?: TLightning
  readonly sparkInvoice?: TSparkInvoice
}

const hasSparkIdentifier = (
  detail: WithSparkDetails<unknown, object, object>
): boolean =>
  detail.lightning !== undefined || detail.sparkInvoice !== undefined

/**
 * Throws `message` unless `detail` is absent or has a Spark identifier.
 * Shared by insert actions that accept optional Spark details.
 */
export const assertHasSparkIdentifier = (
  detail: WithSparkDetails<unknown, object, object> | undefined,
  message: string
): void => {
  if (detail && !hasSparkIdentifier(detail)) {
    throw new Error(message)
  }
}
