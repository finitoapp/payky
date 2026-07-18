import {
  createIdFromString,
  err,
  type InsertValues,
  ok,
  sqliteTrue,
  type Task,
  type UpdateValues,
} from "@evolu/common"
import type {
  DateDep,
  EvoluOwnerIdDep,
  FetchDep,
  FetchError,
} from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import {
  fetchYadioBtcExchangeRate,
  type YadioApiDep,
  type YadioApiError,
  type YadioHttpError,
} from "@/core/integrations/yadio/yadio-client.ts"
import {
  cashRegisterAccountByIdQuery,
  ibanAccountByIdQuery,
} from "@/core/modules/account/account-queries.ts"
import { activeSparkAccountsQuery } from "@/core/modules/account/account-spark-queries.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { createAccountTransaction } from "@/core/modules/account-transaction/account-transaction-actions.ts"
import type { DeviceId } from "@/core/modules/device/device-types.ts"
import type {
  PaymentRow,
  payment,
  paymentBtc,
  paymentBtcLightning,
  paymentBtcSpark,
  paymentCashRegister,
  paymentIban,
} from "@/core/modules/payment/payment.ts"
import {
  createNextPaymentNumberValues,
  createPaymentLastNumberValues,
  createPaymentNumberDate,
} from "@/core/modules/payment-number/payment-number-actions.ts"
import {
  paymentLastNumberQuery,
  paymentNumberByPaymentIdQuery,
} from "@/core/modules/payment-number/payment-number-queries.ts"
import { getPaymentNumberSeries } from "@/core/modules/payment-number-series/payment-number-series-actions.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { getFirstOr } from "@/core/modules/shared/result.ts"
import {
  createTableId,
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"
import type {
  SparkPaymentWallet,
  SparkWalletDep,
} from "@/core/spark/spark-wallet.ts"
import {
  type DateString,
  type NonEmptyString,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  PositiveNumberSchema,
  SpecificSymbol,
  type TimestampMs,
  TimestampMsSchema,
  VariableSymbol,
} from "../shared/schema.ts"
import { paymentByIdQuery } from "./payment-queries.ts"
import type { PaymentId } from "./payment-types.ts"

const SATS_PER_BTC = 100_000_000
const FIAT_MINOR_UNITS = 100

const createPaymentNotFoundError = defineError("PaymentNotFound")<{
  readonly id: PaymentId
}>()
export type PaymentNotFoundError = ReturnType<typeof createPaymentNotFoundError>

const createAccountSparkNotFoundError = defineError("AccountSparkNotFound")<{
  readonly id: AccountId
}>()
export type AccountSparkNotFoundError = ReturnType<
  typeof createAccountSparkNotFoundError
>

const createPaymentPreparationFailedError = defineError(
  "PaymentPreparationFailed"
)<{
  readonly message: string
}>()
export type PaymentPreparationFailedError = ReturnType<
  typeof createPaymentPreparationFailedError
>

const createPaymentNumberNotFoundError = defineError("PaymentNumberNotFound")<{
  readonly paymentId: PaymentId
}>()
export type PaymentNumberNotFoundError = ReturnType<
  typeof createPaymentNumberNotFoundError
>

const createCashRegisterAccountNotFoundError = defineError(
  "CashRegisterAccountNotFound"
)<{
  readonly id: AccountId
}>()
export type CashRegisterAccountNotFoundError = ReturnType<
  typeof createCashRegisterAccountNotFoundError
>

const createCashRegisterAccountCurrencyMismatchError = defineError(
  "CashRegisterAccountCurrencyMismatch"
)<{
  readonly id: AccountId
  readonly accountCurrency: string
  readonly paymentCurrency: string
}>()
export type CashRegisterAccountCurrencyMismatchError = ReturnType<
  typeof createCashRegisterAccountCurrencyMismatchError
>

const createIbanAccountNotFoundError = defineError("IbanAccountNotFound")<{
  readonly id: AccountId
}>()
export type IbanAccountNotFoundError = ReturnType<
  typeof createIbanAccountNotFoundError
>

const createIbanAccountCurrencyMismatchError = defineError(
  "IbanAccountCurrencyMismatch"
)<{
  readonly id: AccountId
  readonly accountCurrency: string
  readonly paymentCurrency: string
}>()
export type IbanAccountCurrencyMismatchError = ReturnType<
  typeof createIbanAccountCurrencyMismatchError
>

export type CreatePreparedPaymentError =
  | AccountSparkNotFoundError
  | PaymentPreparationFailedError
  | YadioHttpError
  | YadioApiError
  | FetchError

export type MarkPaymentPaidCashError =
  | PaymentNotFoundError
  | CashRegisterAccountNotFoundError
  | CashRegisterAccountCurrencyMismatchError

export type PreparePaymentMethodError =
  | PaymentNotFoundError
  | CashRegisterAccountNotFoundError
  | CashRegisterAccountCurrencyMismatchError
  | AccountSparkNotFoundError
  | IbanAccountNotFoundError
  | IbanAccountCurrencyMismatchError
  | PaymentNumberNotFoundError
  | PaymentPreparationFailedError
  | YadioHttpError
  | YadioApiError
  | FetchError

export const paymentNotFound = (id: PaymentId): PaymentNotFoundError =>
  createPaymentNotFoundError({ id })

export const accountSparkNotFound = (
  id: AccountId
): AccountSparkNotFoundError => createAccountSparkNotFoundError({ id })

export const cashRegisterAccountNotFound = (
  id: AccountId
): CashRegisterAccountNotFoundError =>
  createCashRegisterAccountNotFoundError({ id })

export const cashRegisterAccountCurrencyMismatch = ({
  id,
  accountCurrency,
  paymentCurrency,
}: {
  readonly id: AccountId
  readonly accountCurrency: string
  readonly paymentCurrency: string
}): CashRegisterAccountCurrencyMismatchError =>
  createCashRegisterAccountCurrencyMismatchError({
    id,
    accountCurrency,
    paymentCurrency,
  })

export const ibanAccountNotFound = (id: AccountId): IbanAccountNotFoundError =>
  createIbanAccountNotFoundError({ id })

export const ibanAccountCurrencyMismatch = ({
  id,
  accountCurrency,
  paymentCurrency,
}: {
  readonly id: AccountId
  readonly accountCurrency: string
  readonly paymentCurrency: string
}): IbanAccountCurrencyMismatchError =>
  createIbanAccountCurrencyMismatchError({
    id,
    accountCurrency,
    paymentCurrency,
  })

const paymentPreparationFailed = (
  message: string
): PaymentPreparationFailedError =>
  createPaymentPreparationFailedError({ message })

const paymentNumberNotFound = (
  paymentId: PaymentId
): PaymentNumberNotFoundError => createPaymentNumberNotFoundError({ paymentId })

const convertFiatMinorUnitsToSats = (
  amount: number,
  exchangeRate: number
): number => {
  if (amount === 0) return 0

  const fiatAmount = amount / FIAT_MINOR_UNITS
  return Math.max(1, Math.round((fiatAmount / exchangeRate) * SATS_PER_BTC))
}

const createVariableSymbolFromSerialNumber = (
  serialNumber: number
): VariableSymbol => VariableSymbol(String(serialNumber))

const createSpecificSymbolFromDate = (date: DateString): SpecificSymbol =>
  SpecificSymbol(`${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}`)

const optionalNonEmptyString = (
  value: string | null | undefined
): NonEmptyString | undefined =>
  value === null || value === undefined || value === ""
    ? undefined
    : NonEmptyStringSchema.decode(value)

const optionalNonEmptySparkInvoice = (
  sparkInvoice: string | null | undefined
): { readonly sparkInvoice: NonEmptyString } | undefined => {
  const parsedSparkInvoice = optionalNonEmptyString(sparkInvoice)

  return parsedSparkInvoice === undefined
    ? undefined
    : {
        sparkInvoice: parsedSparkInvoice,
      }
}

const hasSparkPaymentIdentifier = ({
  sparkInvoice,
  lightning,
}: {
  readonly lightning?: object
  readonly sparkInvoice?: object
}): boolean => lightning !== undefined || sparkInvoice !== undefined

type PaymentBtcInput = Omit<InsertValues<typeof paymentBtc>, "id"> & {
  readonly lightning?: Omit<InsertValues<typeof paymentBtcLightning>, "id">
  readonly sparkInvoice?: Omit<InsertValues<typeof paymentBtcSpark>, "id">
}

type PaymentBtcUpdateInput = Omit<UpdateValues<typeof paymentBtc>, "id"> & {
  readonly lightning?: Omit<UpdateValues<typeof paymentBtcLightning>, "id">
  readonly sparkInvoice?: Omit<UpdateValues<typeof paymentBtcSpark>, "id">
}

export const loadPayment =
  (idValue: PaymentId): Task<PaymentRow, PaymentNotFoundError, EvoluDep> =>
  async (run) =>
    getFirstOr(
      await run.deps.evolu.loadQuery(paymentByIdQuery(idValue)),
      paymentNotFound(idValue)
    )

export const createPayment =
  ({
    cashRegister,
    spark,
    iban,
    ...input
  }: InsertValues<typeof payment> & {
    readonly cashRegister?: Omit<InsertValues<typeof paymentCashRegister>, "id">
    readonly spark?: PaymentBtcInput
    readonly iban?: Omit<InsertValues<typeof paymentIban>, "id">
  }): Task<PaymentId, never, EvoluDep & EvoluOwnerIdDep & DateDep> =>
  async (run) => {
    if (spark && !hasSparkPaymentIdentifier(spark)) {
      throw new Error("Spark payment requires lnInvoice or sparkInvoice.")
    }

    const id = createTableId<"Payment">()
    const { evoluOwnerId } = run.deps
    const series = await run.orThrow(getPaymentNumberSeries())
    const [previousPaymentNumber] = await run.deps.evolu.loadQuery(
      paymentLastNumberQuery
    )
    const paymentNumber = createNextPaymentNumberValues({
      id,
      date: createPaymentNumberDate(run.deps.date.now()),
      series,
      previous: previousPaymentNumber,
    })
    const paymentLastNumber = createPaymentLastNumberValues(paymentNumber)

    await runMutationWithCompletion((options) => {
      run.deps.evolu.upsert("paymentNumber", paymentNumber, {
        ...options,
        ownerId: evoluOwnerId,
      })
      run.deps.evolu.upsert("paymentLastNumber", paymentLastNumber, {
        ...options,
        ownerId: evoluOwnerId,
      })

      if (cashRegister) {
        run.deps.evolu.upsert(
          "paymentCashRegister",
          removeUndefinedValues({
            ...cashRegister,
            id,
          }),
          { ...options, ownerId: evoluOwnerId }
        )
      }

      if (spark) {
        run.deps.evolu.upsert(
          "paymentBtc",
          removeUndefinedValues({
            accountId: spark.accountId,
            amountSats: spark.amountSats,
            exchangeRate: spark.exchangeRate,
            exchangeRateSource: spark.exchangeRateSource,
            exchangeRateFetchedAt: spark.exchangeRateFetchedAt,
            id,
          }),
          { ...options, ownerId: evoluOwnerId }
        )
        if (spark.lightning) {
          run.deps.evolu.upsert(
            "paymentBtcLightning",
            removeUndefinedValues({
              ...spark.lightning,
              id,
            }),
            { ...options, ownerId: evoluOwnerId }
          )
        }
        if (spark.sparkInvoice) {
          run.deps.evolu.upsert(
            "paymentBtcSpark",
            removeUndefinedValues({
              ...spark.sparkInvoice,
              id,
            }),
            { ...options, ownerId: evoluOwnerId }
          )
        }
      }

      if (iban) {
        run.deps.evolu.upsert(
          "paymentIban",
          removeUndefinedValues({
            ...iban,
            id,
          }),
          { ...options, ownerId: evoluOwnerId }
        )
      }

      return run.deps.evolu.upsert(
        "payment",
        removeUndefinedValues({
          ...input,
          id,
        }),
        { ...options, ownerId: evoluOwnerId }
      )
    })

    return ok(id)
  }

export const createPreparedPayment =
  ({
    spark,
    ...input
  }: InsertValues<typeof payment> & {
    readonly cashRegister?: Omit<InsertValues<typeof paymentCashRegister>, "id">
    readonly spark?: Omit<
      InsertValues<typeof paymentBtc>,
      | "id"
      | "amountSats"
      | "exchangeRate"
      | "exchangeRateSource"
      | "exchangeRateFetchedAt"
    > & {
      readonly memo?: string
      readonly expirySeconds?: number
      readonly includeSparkInvoice?: boolean
    }
    readonly iban?: Omit<InsertValues<typeof paymentIban>, "id">
  }): Task<
    PaymentId,
    CreatePreparedPaymentError,
    EvoluDep &
      EvoluOwnerIdDep &
      DateDep &
      SparkWalletDep &
      FetchDep &
      YadioApiDep
  > =>
  async (run) => {
    if (!spark) {
      return run(createPayment(input))
    }

    const sparkAccounts = await run.deps.evolu.loadQuery(
      activeSparkAccountsQuery
    )
    const sparkAccount = sparkAccounts.find(
      (account) => account.id === spark.accountId
    )
    if (!sparkAccount) {
      return err(accountSparkNotFound(spark.accountId))
    }

    let wallet: SparkPaymentWallet | undefined
    try {
      const quote = await run(fetchYadioBtcExchangeRate(input.currency))
      if (!quote.ok) {
        return quote
      }

      const amountSats = NonNegativeIntegerSchema.decode(
        convertFiatMinorUnitsToSats(input.amount, quote.value.exchangeRate)
      )
      wallet = await run.deps.sparkWallet.create(sparkAccount.secret)
      const lightningInvoice = await wallet.createLightningInvoice(
        removeUndefinedValues({
          amountSats,
          memo: spark.memo,
          expirySeconds: spark.expirySeconds,
          includeSparkInvoice: spark.includeSparkInvoice ?? true,
        })
      )

      const paymentResult = await run(
        createPayment({
          ...input,
          spark: {
            accountId: spark.accountId,
            amountSats,
            exchangeRate: PositiveNumberSchema.decode(quote.value.exchangeRate),
            exchangeRateSource: "yadio",
            exchangeRateFetchedAt: TimestampMsSchema.decode(
              quote.value.fetchedAt
            ),
            lightning: {
              lnInvoice: NonEmptyStringSchema.decode(
                lightningInvoice.invoice.encodedInvoice
              ),
              ...removeUndefinedValues({
                lightningReceiveRequestId: optionalNonEmptyString(
                  lightningInvoice.id
                ),
                paymentHash: optionalNonEmptyString(
                  lightningInvoice.invoice.paymentHash
                ),
                paymentPreimage: optionalNonEmptyString(
                  lightningInvoice.paymentPreimage
                ),
              }),
            },
            sparkInvoice: optionalNonEmptySparkInvoice(
              lightningInvoice.sparkInvoice
            ),
          },
        })
      )
      if (!paymentResult.ok) return paymentResult

      return ok(paymentResult.value)
    } catch (error) {
      return err(
        paymentPreparationFailed(
          error instanceof Error
            ? error.message
            : "Failed to prepare payment details"
        )
      )
    } finally {
      await wallet?.cleanup?.()
    }
  }

export const preparePaymentMethod =
  ({
    paymentId,
    bank,
    cashRegister,
    spark,
  }: {
    readonly paymentId: PaymentId
    readonly bank?: {
      readonly accountId: AccountId
    }
    readonly cashRegister?: {
      readonly accountId: AccountId
    }
    readonly spark?: {
      readonly accountId: AccountId
      readonly memo?: string
      readonly expirySeconds?: number
      readonly includeSparkInvoice?: boolean
    }
  }): Task<
    PaymentId,
    PreparePaymentMethodError,
    EvoluDep & EvoluOwnerIdDep & SparkWalletDep & FetchDep & YadioApiDep
  > =>
  async (run) => {
    const { evoluOwnerId } = run.deps
    const paymentResult = await run(loadPayment(paymentId))
    if (!paymentResult.ok) return paymentResult

    const payment = paymentResult.value

    const cashRegisterPayment =
      cashRegister === undefined
        ? null
        : await (async () => {
            const accountResult = getFirstOr(
              await run.deps.evolu.loadQuery(
                cashRegisterAccountByIdQuery(cashRegister.accountId)
              ),
              cashRegisterAccountNotFound(cashRegister.accountId)
            )
            if (!accountResult.ok) return accountResult

            const account = accountResult.value
            if (account.currency !== payment.currency) {
              return err(
                cashRegisterAccountCurrencyMismatch({
                  id: cashRegister.accountId,
                  accountCurrency: account.currency,
                  paymentCurrency: payment.currency,
                })
              )
            }

            return ok({
              id: paymentId,
              accountId: cashRegister.accountId,
            })
          })()
    if (cashRegisterPayment !== null && !cashRegisterPayment.ok) {
      return cashRegisterPayment
    }

    const bankPayment =
      bank === undefined
        ? null
        : await (async () => {
            const accountResult = getFirstOr(
              await run.deps.evolu.loadQuery(
                ibanAccountByIdQuery(bank.accountId)
              ),
              ibanAccountNotFound(bank.accountId)
            )
            if (!accountResult.ok) return accountResult

            const account = accountResult.value
            if (account.currency !== payment.currency) {
              return err(
                ibanAccountCurrencyMismatch({
                  id: bank.accountId,
                  accountCurrency: account.currency,
                  paymentCurrency: payment.currency,
                })
              )
            }

            const paymentNumberResult = getFirstOr(
              await run.deps.evolu.loadQuery(
                paymentNumberByPaymentIdQuery(paymentId)
              ),
              paymentNumberNotFound(paymentId)
            )
            if (!paymentNumberResult.ok) return paymentNumberResult

            const paymentNumber = paymentNumberResult.value
            const variableSymbol = createVariableSymbolFromSerialNumber(
              paymentNumber.serialNumber
            )
            const specificSymbol = createSpecificSymbolFromDate(
              paymentNumber.date
            )

            const paymentIbanValue = removeUndefinedValues({
              id: paymentId,
              accountId: bank.accountId,
              variableSymbol,
              specificSymbol,
            })

            return ok(paymentIbanValue)
          })()
    if (bankPayment !== null && !bankPayment.ok) {
      return bankPayment
    }

    const sparkPaymentResult =
      spark === undefined
        ? null
        : await (async () => {
            const sparkAccounts = await run.deps.evolu.loadQuery(
              activeSparkAccountsQuery
            )
            const sparkAccount = sparkAccounts.find(
              (account) => account.id === spark.accountId
            )
            if (!sparkAccount) return err(accountSparkNotFound(spark.accountId))

            let wallet: SparkPaymentWallet | undefined
            try {
              const quote = await run(
                fetchYadioBtcExchangeRate(payment.currency)
              )
              if (!quote.ok) return quote

              const amountSats = NonNegativeIntegerSchema.decode(
                convertFiatMinorUnitsToSats(
                  payment.amount,
                  quote.value.exchangeRate
                )
              )
              wallet = await run.deps.sparkWallet.create(sparkAccount.secret)
              const lightningInvoice = await wallet.createLightningInvoice(
                removeUndefinedValues({
                  amountSats,
                  memo: spark.memo,
                  expirySeconds: spark.expirySeconds,
                  includeSparkInvoice: spark.includeSparkInvoice ?? true,
                })
              )

              return ok({
                id: paymentId,
                accountId: spark.accountId,
                amountSats,
                exchangeRate: PositiveNumberSchema.decode(
                  quote.value.exchangeRate
                ),
                exchangeRateSource: "yadio" as const,
                exchangeRateFetchedAt: TimestampMsSchema.decode(
                  quote.value.fetchedAt
                ),
                lightning: {
                  lnInvoice: NonEmptyStringSchema.decode(
                    lightningInvoice.invoice.encodedInvoice
                  ),
                  ...removeUndefinedValues({
                    lightningReceiveRequestId: optionalNonEmptyString(
                      lightningInvoice.id
                    ),
                    paymentHash: optionalNonEmptyString(
                      lightningInvoice.invoice.paymentHash
                    ),
                    paymentPreimage: optionalNonEmptyString(
                      lightningInvoice.paymentPreimage
                    ),
                  }),
                },
                sparkInvoice: optionalNonEmptySparkInvoice(
                  lightningInvoice.sparkInvoice
                ),
              })
            } catch (error) {
              return err(
                paymentPreparationFailed(
                  error instanceof Error
                    ? error.message
                    : "Failed to prepare payment details"
                )
              )
            } finally {
              await wallet?.cleanup?.()
            }
          })()
    if (sparkPaymentResult !== null && !sparkPaymentResult.ok) {
      return sparkPaymentResult
    }

    if (
      cashRegisterPayment === null &&
      bankPayment === null &&
      sparkPaymentResult === null
    ) {
      return ok(paymentId)
    }

    await runMutationWithCompletion((options) => {
      if (cashRegisterPayment?.ok) {
        run.deps.evolu.upsert(
          "paymentCashRegister",
          cashRegisterPayment.value,
          {
            ...options,
            ownerId: evoluOwnerId,
          }
        )
      }

      if (bankPayment?.ok) {
        run.deps.evolu.upsert("paymentIban", bankPayment.value, {
          ...options,
          ownerId: evoluOwnerId,
        })
      }

      if (sparkPaymentResult?.ok) {
        run.deps.evolu.upsert(
          "paymentBtc",
          removeUndefinedValues({
            id: sparkPaymentResult.value.id,
            accountId: sparkPaymentResult.value.accountId,
            amountSats: sparkPaymentResult.value.amountSats,
            exchangeRate: sparkPaymentResult.value.exchangeRate,
            exchangeRateSource: sparkPaymentResult.value.exchangeRateSource,
            exchangeRateFetchedAt:
              sparkPaymentResult.value.exchangeRateFetchedAt,
          }),
          {
            ...options,
            ownerId: evoluOwnerId,
          }
        )
        if (sparkPaymentResult.value.lightning) {
          run.deps.evolu.upsert(
            "paymentBtcLightning",
            removeUndefinedValues({
              ...sparkPaymentResult.value.lightning,
              id: sparkPaymentResult.value.id,
            }),
            {
              ...options,
              ownerId: evoluOwnerId,
            }
          )
        }
        if (sparkPaymentResult.value.sparkInvoice) {
          run.deps.evolu.upsert(
            "paymentBtcSpark",
            removeUndefinedValues({
              ...sparkPaymentResult.value.sparkInvoice,
              id: sparkPaymentResult.value.id,
            }),
            {
              ...options,
              ownerId: evoluOwnerId,
            }
          )
        }
      }
    })

    return ok(paymentId)
  }

export const updatePayment =
  ({
    cashRegister,
    spark,
    iban,
    ...input
  }: Pick<
    UpdateValues<typeof payment>,
    | "id"
    | "deviceId"
    | "billId"
    | "tableId"
    | "amount"
    | "currency"
    | "tipAmount"
    | "canceledAt"
  > & {
    readonly cashRegister?: Omit<UpdateValues<typeof paymentCashRegister>, "id">
    readonly spark?: PaymentBtcUpdateInput
    readonly iban?: Omit<UpdateValues<typeof paymentIban>, "id">
  }): Task<PaymentId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) => {
      if (cashRegister) {
        run.deps.evolu.update(
          "paymentCashRegister",
          removeUndefinedValues({
            ...cashRegister,
            id: input.id,
          }),
          { ...options, ownerId: evoluOwnerId }
        )
      }

      if (spark) {
        run.deps.evolu.update(
          "paymentBtc",
          removeUndefinedValues({
            accountId: spark.accountId,
            amountSats: spark.amountSats,
            exchangeRate: spark.exchangeRate,
            exchangeRateSource: spark.exchangeRateSource,
            exchangeRateFetchedAt: spark.exchangeRateFetchedAt,
            id: input.id,
          }),
          { ...options, ownerId: evoluOwnerId }
        )
        if (spark.lightning) {
          run.deps.evolu.update(
            "paymentBtcLightning",
            removeUndefinedValues({
              ...spark.lightning,
              id: input.id,
            }),
            { ...options, ownerId: evoluOwnerId }
          )
        }
        if (spark.sparkInvoice) {
          run.deps.evolu.update(
            "paymentBtcSpark",
            removeUndefinedValues({
              ...spark.sparkInvoice,
              id: input.id,
            }),
            { ...options, ownerId: evoluOwnerId }
          )
        }
      }

      if (iban) {
        run.deps.evolu.update(
          "paymentIban",
          removeUndefinedValues({
            ...iban,
            id: input.id,
          }),
          { ...options, ownerId: evoluOwnerId }
        )
      }

      return run.deps.evolu.update("payment", removeUndefinedValues(input), {
        ...options,
        ownerId: evoluOwnerId,
      })
    })

    return ok(input.id)
  }

export const deletePayment =
  (paymentId: PaymentId): Task<PaymentId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "payment",
        {
          id: paymentId,
          isDeleted: sqliteTrue,
        },
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(paymentId)
  }

export const markPaymentPaidCash =
  ({
    paymentId,
    accountId,
    deviceId,
    occurredAt,
    note,
  }: {
    readonly paymentId: PaymentId
    readonly accountId: AccountId
    readonly deviceId?: DeviceId | null
    readonly occurredAt?: TimestampMs
    readonly note?: NonEmptyString | null
  }): Task<
    PaymentId,
    MarkPaymentPaidCashError,
    EvoluDep & EvoluOwnerIdDep & DateDep
  > =>
  async (run) => {
    const { evoluOwnerId } = run.deps
    const paymentResult = await run(loadPayment(paymentId))
    if (!paymentResult.ok) return paymentResult

    const payment = paymentResult.value
    const cashRegisterAccountResult = getFirstOr(
      await run.deps.evolu.loadQuery(cashRegisterAccountByIdQuery(accountId)),
      cashRegisterAccountNotFound(accountId)
    )
    if (!cashRegisterAccountResult.ok) return cashRegisterAccountResult

    const cashRegisterAccount = cashRegisterAccountResult.value
    if (cashRegisterAccount.currency !== payment.currency) {
      return err(
        cashRegisterAccountCurrencyMismatch({
          id: accountId,
          accountCurrency: cashRegisterAccount.currency,
          paymentCurrency: payment.currency,
        })
      )
    }

    const accountTransactionResult = await run(
      createAccountTransaction({
        id: createIdFromString<"AccountTransaction">(
          `accountTransaction:cashRegister:payment:${paymentId}:${accountId}`
        ),
        accountId,
        amount: payment.amount,
        currency: payment.currency,
        occurredAt:
          occurredAt ?? TimestampMsSchema.decode(run.deps.date.now().getTime()),
        note: note ?? null,
        internalTransferGroupId: null,
        source: {
          deviceId: deviceId ?? null,
          source: "manual",
        },
      })
    )
    if (!accountTransactionResult.ok) return accountTransactionResult

    const id = createIdFromString<"ReconciliationClaim">(
      `reconciliationClaim:manual:${paymentId}:${accountTransactionResult.value}`
    )

    await runMutationWithCompletion((options) =>
      run.deps.evolu.upsert(
        "reconciliationClaim",
        removeUndefinedValues({
          id,
          deviceId: deviceId ?? null,
          paymentId,
          accountTransactionId: accountTransactionResult.value,
          source: "manual" as const,
          claimedAt: TimestampMsSchema.decode(run.deps.date.now().getTime()),
        }),
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(paymentId)
  }

export const cancelPayment =
  (
    paymentId: PaymentId
  ): Task<PaymentId, never, EvoluDep & EvoluOwnerIdDep & DateDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "payment",
        {
          id: paymentId,
          canceledAt: TimestampMsSchema.decode(run.deps.date.now().getTime()),
        },
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(paymentId)
  }
