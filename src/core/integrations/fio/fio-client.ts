import { err, ok, type Task } from "@evolu/common"
import { z } from "zod"

import { appFetchAsText, type FetchDep, type FetchError } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import {
  ConstantSymbolSchema,
  type DateString,
  DateStringSchema,
  type FiatCurrency,
  FiatCurrencySchema,
  type Iban,
  IbanSchema,
  SpecificSymbolSchema,
  VariableSymbolSchema,
} from "@/core/modules/shared/schema.ts"
import { jsonCodec } from "@/zod-utils.ts"

const FIO_BASE_URL = "https://fioapi.fio.cz"

export interface FioApiOptions {
  readonly tokens: readonly [string, ...string[]]
  readonly baseUrl?: string
}

export interface FioApiDep {
  readonly fioApi: {
    readonly baseUrl: string
    readonly getToken: () => string
  }
}

export const createFioApiDep = ({
  tokens,
  baseUrl = FIO_BASE_URL,
}: FioApiOptions): FioApiDep => {
  let tokenIndex = 0

  return {
    fioApi: {
      baseUrl,
      getToken: () => {
        const token = tokens[tokenIndex] ?? tokens[0]
        tokenIndex = tokenIndex + 1 >= tokens.length ? 0 : tokenIndex + 1

        return token
      },
    },
  }
}

const createFioApiError = defineError("FioApiError")<{
  readonly message: string
  readonly cause?: unknown
}>()
export type FioApiError = ReturnType<typeof createFioApiError>

const createFioHttpError = defineError("FioHttpError")<{
  readonly message: string
  readonly status: number
  readonly responseBody: string
}>()
export type FioHttpError = ReturnType<typeof createFioHttpError>

const createFioRateLimitError = defineError("FioRateLimitError")<{
  readonly message: string
  readonly status: 409
  readonly responseBody: string
}>()
export type FioRateLimitError = ReturnType<typeof createFioRateLimitError>

const createFioStrongAuthorizationRequiredError = defineError(
  "FioStrongAuthorizationRequiredError"
)<{
  readonly message: string
  readonly status: 422
  readonly responseBody: string
}>()
export type FioStrongAuthorizationRequiredError = ReturnType<
  typeof createFioStrongAuthorizationRequiredError
>

const FioValueSchema = z.union([z.string(), z.number()])

const FioRawTransactionSchema = z
  .record(
    z.string(),
    z
      .object({
        value: FioValueSchema,
        name: z.string(),
      })
      .nullable()
  )
  .transform((columns): Readonly<Record<string, string | number>> => {
    const normalized: Record<string, string | number> = {}

    for (const column of Object.values(columns)) {
      if (column === null) continue
      normalized[column.name] = column.value
    }

    return normalized
  })

const FioDateSchema = z.string().transform((value, ctx): DateString => {
  const date = value.slice(0, 10)
  const parsed = DateStringSchema.safeParse(date)

  if (!parsed.success) {
    ctx.issues.push({
      code: "custom",
      message: "Invalid FIO transaction date.",
      input: value,
    })
    return z.NEVER
  }

  return parsed.data
})

const FioOptionalSymbolSchema = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => {
    if (value === undefined) return null

    const normalized = String(value).trim()
    return normalized.length > 0 ? normalized : null
  })

const FioOptionalStringSchema = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => {
    if (value === undefined) return null

    const normalized = String(value).trim()
    return normalized.length > 0 ? normalized : null
  })

const moneyToMinorUnits = (value: string | number): number => {
  const normalized =
    typeof value === "number"
      ? value.toFixed(2)
      : value.trim().replace(",", ".")
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(normalized)

  if (!match) {
    throw new Error(`Invalid FIO amount: ${String(value)}`)
  }

  const sign = match[1] === "-" ? -1 : 1
  const whole = match[2]
  const fraction = (match[3] ?? "").padEnd(2, "0")

  return sign * (Number(whole) * 100 + Number(fraction))
}

const FioAmountMinorSchema = FioValueSchema.transform((value, ctx): number => {
  try {
    return moneyToMinorUnits(value)
  } catch (error) {
    ctx.issues.push({
      code: "custom",
      message: error instanceof Error ? error.message : "Invalid FIO amount.",
      input: value,
    })
    return z.NEVER
  }
})

const nullableParse =
  <TSchema extends z.ZodType>(schema: TSchema) =>
  (value: string | null): z.output<TSchema> | null => {
    if (value === null) return null

    const parsed = schema.safeParse(value)
    return parsed.success ? parsed.data : null
  }

const FioTransactionSchema = z
  .looseObject({
    "ID pohybu": FioValueSchema.transform((value) => String(value)),
    Datum: FioDateSchema,
    Objem: FioAmountMinorSchema,
    Měna: FiatCurrencySchema,
    Protiúčet: FioOptionalStringSchema,
    "Název protiúčtu": FioOptionalStringSchema,
    "Kód banky": FioOptionalStringSchema,
    "Název banky": FioOptionalStringSchema,
    KS: FioOptionalSymbolSchema,
    VS: FioOptionalSymbolSchema,
    SS: FioOptionalSymbolSchema,
    "Uživatelská identifikace": FioOptionalStringSchema,
    "Zpráva pro příjemce": FioOptionalStringSchema,
    Typ: FioOptionalStringSchema,
    "ID pokynu": FioOptionalStringSchema,
  })
  .transform((transaction) => ({
    id: transaction["ID pohybu"],
    bookedDate: transaction.Datum,
    amountMinor: transaction.Objem,
    currency: transaction.Měna,
    counterAccountNumber: transaction.Protiúčet,
    counterAccountName: transaction["Název protiúčtu"],
    counterBankCode: transaction["Kód banky"],
    counterBankName: transaction["Název banky"],
    constantSymbol: nullableParse(ConstantSymbolSchema)(transaction.KS),
    variableSymbol: nullableParse(VariableSymbolSchema)(transaction.VS),
    specificSymbol: nullableParse(SpecificSymbolSchema)(transaction.SS),
    userIdentification: transaction["Uživatelská identifikace"],
    recipientMessage: transaction["Zpráva pro příjemce"],
    type: transaction.Typ,
    instructionId: transaction["ID pokynu"],
    raw: transaction,
  }))

const FioTransactionListSchema = z.object({
  transaction: z
    .union([FioRawTransactionSchema, FioRawTransactionSchema.array()])
    .optional()
    .transform((transactions, ctx): ReadonlyArray<FioTransaction> => {
      const rawTransactions =
        transactions === undefined
          ? []
          : Array.isArray(transactions)
            ? transactions
            : [transactions]
      const parsed = FioTransactionSchema.array().safeParse(rawTransactions)

      if (!parsed.success) {
        ctx.issues.push({
          code: "custom",
          message: "Invalid FIO transaction list.",
          input: transactions,
        })
        return z.NEVER
      }

      return parsed.data
    }),
})

const FioAccountStatementSchema = z.object({
  accountStatement: z.object({
    info: z.looseObject({
      iban: IbanSchema,
      currency: FiatCurrencySchema.optional(),
    }),
    transactionList: FioTransactionListSchema,
  }),
})

export type FioTransaction = z.output<typeof FioTransactionSchema>

export interface FioAccountStatement {
  readonly iban: Iban
  readonly currency: FiatCurrency | null
  readonly transactions: ReadonlyArray<FioTransaction>
}

type FioTask<TResult> = Task<
  TResult,
  | FioApiError
  | FioHttpError
  | FioRateLimitError
  | FioStrongAuthorizationRequiredError
  | FetchError,
  FioApiDep & FetchDep
>

export const fetchFioLastTransactions = (): FioTask<FioAccountStatement> =>
  getFioStatement((token) => `/v1/rest/last/${token}/transactions.json`)

export const fetchFioTransactionsByPeriod = ({
  from,
  to,
}: {
  readonly from: DateString
  readonly to: DateString
}): FioTask<FioAccountStatement> =>
  getFioStatement(
    (token) => `/v1/rest/periods/${token}/${from}/${to}/transactions.json`
  )

export const setFioLastDate =
  ({ date }: { readonly date: DateString }): FioTask<string> =>
  async (run) => {
    const response = await run(
      requestFioApi(
        `/v1/rest/set-last-date/${getEncodedFioToken(run.deps)}/${date}/`
      )
    )
    if (!response.ok) return response

    return ok(response.value)
  }

const getFioStatement =
  (
    createPath: (encodedToken: string) => string
  ): FioTask<FioAccountStatement> =>
  async (run) => {
    const response = await run(
      requestFioApi(createPath(getEncodedFioToken(run.deps)))
    )
    if (!response.ok) return response

    const parsed = jsonCodec(FioAccountStatementSchema).safeParse(
      response.value
    )
    if (!parsed.success) {
      return err(
        createFioApiError({
          message: "Invalid FIO account statement response.",
          cause: parsed.error,
        })
      )
    }

    const statement = parsed.data.accountStatement

    return ok({
      iban: statement.info.iban,
      currency: statement.info.currency ?? null,
      transactions: statement.transactionList.transaction,
    })
  }

const requestFioApi =
  (
    path: string
  ): Task<
    string,
    | FioHttpError
    | FioRateLimitError
    | FioStrongAuthorizationRequiredError
    | FetchError,
    FioApiDep & FetchDep
  > =>
  async (run) => {
    const url = new URL(path, run.deps.fioApi.baseUrl)
    const responseResult = await run(
      appFetchAsText(url, {
        method: "GET",
        headers: {
          Accept: "application/json, text/plain",
        },
      })
    )

    if (!responseResult.ok) return responseResult

    const response = responseResult.value
    if (!response.ok) {
      const responseBody = response.text
      if (
        isFioStrongAuthorizationRequiredResponse(response.status, responseBody)
      ) {
        return err(
          createFioStrongAuthorizationRequiredError({
            message:
              "FIO API requires strong authorization to provide the requested data.",
            status: 422,
            responseBody,
          })
        )
      }
      if (response.status === 409) {
        return err(
          createFioRateLimitError({
            message:
              "FIO API request failed because the interval between requests was not respected.",
            status: 409,
            responseBody,
          })
        )
      }

      return err(
        createFioHttpError({
          message: `FIO API request failed with HTTP ${response.status}.`,
          status: response.status,
          responseBody,
        })
      )
    }

    return ok(response.text)
  }

const isFioStrongAuthorizationRequiredResponse = (
  responseStatus: number,
  responseBody: string
): boolean =>
  responseStatus === 422 &&
  responseBody.includes("Data není možné poskytnout bez silné autorizace")

const getEncodedFioToken = (deps: FioApiDep): string =>
  encodeURIComponent(deps.fioApi.getToken())
