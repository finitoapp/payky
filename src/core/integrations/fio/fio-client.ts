import { z } from "zod"

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

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

export interface FioApiClientOptions {
  readonly tokens: readonly [string, ...string[]]
  readonly baseUrl?: string
  readonly fetch?: FetchLike
}

export class FioApiError extends Error {
  public readonly cause?: unknown

  public constructor(message: string, cause?: unknown) {
    super(message)
    this.name = "FioApiError"
    this.cause = cause
  }
}

export class FioHttpError extends Error {
  public readonly status: number
  public readonly responseBody: string

  public constructor(message: string, status: number, responseBody: string) {
    super(message)
    this.name = "FioHttpError"
    this.status = status
    this.responseBody = responseBody
  }
}

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
      if (column == null) continue
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
    if (value == null) return null

    const normalized = String(value).trim()
    return normalized.length > 0 ? normalized : null
  })

const FioOptionalStringSchema = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => {
    if (value == null) return null

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
    if (value == null) return null

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
        transactions == null
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

const SetLastDateResponseSchema = z.string()

export type FioTransaction = z.output<typeof FioTransactionSchema>

export interface FioAccountStatement {
  readonly iban: Iban
  readonly currency: FiatCurrency | null
  readonly transactions: ReadonlyArray<FioTransaction>
}

export class FioApiClient {
  readonly #tokens: readonly [string, ...string[]]
  readonly #baseUrl: string
  readonly #fetch: FetchLike
  #tokenIndex = 0

  public constructor(options: FioApiClientOptions) {
    this.#tokens = options.tokens
    this.#baseUrl = options.baseUrl ?? "https://fioapi.fio.cz"
    this.#fetch = options.fetch ?? fetch
  }

  public async getLastTransactions(): Promise<FioAccountStatement> {
    return await this.#getStatement(
      `/v1/rest/last/${this.#getToken()}/transactions.json`
    )
  }

  public async getTransactionsByPeriod({
    from,
    to,
  }: {
    readonly from: DateString
    readonly to: DateString
  }): Promise<FioAccountStatement> {
    return await this.#getStatement(
      `/v1/rest/periods/${this.#getToken()}/${from}/${to}/transactions.json`
    )
  }

  public async setLastDate({
    date,
  }: {
    readonly date: DateString
  }): Promise<string> {
    const response = await this.#request(
      `/v1/rest/set-last-date/${this.#getToken()}/${date}/`
    )
    const body = await response.text()
    return SetLastDateResponseSchema.parse(body)
  }

  #getToken(): string {
    const token = this.#tokens[this.#tokenIndex]

    if (token == null) {
      throw new FioApiError("FIO API client requires at least one token.")
    }

    this.#tokenIndex =
      this.#tokenIndex + 1 >= this.#tokens.length ? 0 : this.#tokenIndex + 1

    return encodeURIComponent(token)
  }

  async #getStatement(path: string): Promise<FioAccountStatement> {
    const response = await this.#request(path)
    const unknownJson: unknown = await response.json()
    const parsed = FioAccountStatementSchema.safeParse(unknownJson)

    if (!parsed.success) {
      throw new FioApiError(
        "Invalid FIO account statement response.",
        parsed.error
      )
    }

    const statement = parsed.data.accountStatement

    return {
      iban: statement.info.iban,
      currency: statement.info.currency ?? null,
      transactions: statement.transactionList.transaction,
    }
  }

  async #request(path: string): Promise<Response> {
    const url = new URL(path, this.#baseUrl)
    const response = await this.#fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain",
      },
    })

    if (!response.ok) {
      throw new FioHttpError(
        `FIO API request failed with HTTP ${response.status}.`,
        response.status,
        await response.text()
      )
    }

    return response
  }
}
