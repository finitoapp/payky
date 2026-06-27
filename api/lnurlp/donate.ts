import { z } from "zod"

import { createDefaultSparkPaymentWallet } from "../../src/core/spark/spark-wallet.ts"

const MSATS_PER_SAT = 1_000
const DEFAULT_MIN_SENDABLE_SATS = 1
const DEFAULT_MAX_SENDABLE_SATS = 1_000_000
const DEFAULT_INVOICE_EXPIRY_SECONDS = 600

const EnvSchema = z
  .object({
    PAYKY_DONATE_SPARK_MNEMONIC: z.string().trim().min(1),
    PAYKY_DONATE_MIN_SATS: z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_MIN_SENDABLE_SATS),
    PAYKY_DONATE_MAX_SATS: z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_MAX_SENDABLE_SATS),
    PAYKY_DONATE_DESCRIPTION: z
      .string()
      .trim()
      .min(1)
      .default("Donate to Payky"),
    PAYKY_DONATE_IDENTIFIER: z.string().trim().min(1).optional(),
    PAYKY_DONATE_CALLBACK_URL: z.string().trim().url().optional(),
    PAYKY_DONATE_INVOICE_EXPIRY_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_INVOICE_EXPIRY_SECONDS),
  })
  .refine((env) => env.PAYKY_DONATE_MIN_SATS <= env.PAYKY_DONATE_MAX_SATS, {
    message:
      "PAYKY_DONATE_MIN_SATS must be lower than or equal to PAYKY_DONATE_MAX_SATS.",
    path: ["PAYKY_DONATE_MIN_SATS"],
  })

interface DonateConfig {
  readonly mnemonic: string
  readonly minSendableMsats: number
  readonly maxSendableMsats: number
  readonly description: string
  readonly identifier: string
  readonly callbackUrl: string
  readonly invoiceExpirySeconds: number
}

interface LnurlPayMetadata {
  readonly tag: "payRequest"
  readonly callback: string
  readonly minSendable: number
  readonly maxSendable: number
  readonly metadata: string
}

interface LnurlPayInvoice {
  readonly pr: string
  readonly routes: readonly []
}

interface LnurlError {
  readonly status: "ERROR"
  readonly reason: string
}

const jsonHeaders = {
  "access-control-allow-origin": "*",
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
} as const

const getRequestOrigin = (request: Request): string => {
  const forwardedProto = request.headers.get("x-forwarded-proto")
  const forwardedHost = request.headers.get("x-forwarded-host")

  if (forwardedProto !== null && forwardedHost !== null) {
    return `${forwardedProto}://${forwardedHost}`
  }

  return new URL(request.url).origin
}

const getDefaultIdentifier = (request: Request): string => {
  const host =
    request.headers.get("x-forwarded-host") ?? new URL(request.url).host

  return `donate@${host}`
}

const loadConfig = (request: Request): DonateConfig | LnurlError => {
  const parsedEnv = EnvSchema.safeParse(process.env)

  if (!parsedEnv.success) {
    return {
      status: "ERROR",
      reason: "Donation endpoint is not configured.",
    }
  }

  const env = parsedEnv.data

  return {
    mnemonic: env.PAYKY_DONATE_SPARK_MNEMONIC,
    minSendableMsats: env.PAYKY_DONATE_MIN_SATS * MSATS_PER_SAT,
    maxSendableMsats: env.PAYKY_DONATE_MAX_SATS * MSATS_PER_SAT,
    description: env.PAYKY_DONATE_DESCRIPTION,
    identifier: env.PAYKY_DONATE_IDENTIFIER ?? getDefaultIdentifier(request),
    callbackUrl:
      env.PAYKY_DONATE_CALLBACK_URL ??
      `${getRequestOrigin(request)}/.well-known/lnurlp/donate`,
    invoiceExpirySeconds: env.PAYKY_DONATE_INVOICE_EXPIRY_SECONDS,
  }
}

const jsonResponse = (
  body: LnurlPayMetadata | LnurlPayInvoice | LnurlError,
  init?: ResponseInit
): Response =>
  Response.json(body, {
    ...init,
    headers: {
      ...jsonHeaders,
      ...init?.headers,
    },
  })

const createMetadata = (config: DonateConfig): LnurlPayMetadata => ({
  tag: "payRequest",
  callback: config.callbackUrl,
  minSendable: config.minSendableMsats,
  maxSendable: config.maxSendableMsats,
  metadata: JSON.stringify([
    ["text/plain", config.description],
    ["text/identifier", config.identifier],
  ]),
})

const parseAmountMsats = (value: string | null): number | LnurlError => {
  if (value === null) {
    return {
      status: "ERROR",
      reason: "Missing amount.",
    }
  }

  const amount = Number(value)

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return {
      status: "ERROR",
      reason: "Amount must be a positive integer in millisatoshi.",
    }
  }

  return amount
}

const validateAmountMsats = (
  amountMsats: number,
  config: DonateConfig
): number | LnurlError => {
  if (
    amountMsats < config.minSendableMsats ||
    amountMsats > config.maxSendableMsats
  ) {
    return {
      status: "ERROR",
      reason: "Amount is outside the allowed donation range.",
    }
  }

  if (amountMsats % MSATS_PER_SAT !== 0) {
    return {
      status: "ERROR",
      reason: "Amount must be divisible by 1000 millisatoshi.",
    }
  }

  return amountMsats / MSATS_PER_SAT
}

const createInvoice = async (
  amountSats: number,
  config: DonateConfig
): Promise<LnurlPayInvoice | LnurlError> => {
  try {
    await using wallet = await createDefaultSparkPaymentWallet(config.mnemonic)
    const invoice = await wallet.createLightningInvoice({
      amountSats,
      memo: config.description,
      expirySeconds: config.invoiceExpirySeconds,
      includeSparkInvoice: false,
    })

    return {
      pr: invoice.invoice.encodedInvoice,
      routes: [],
    }
  } catch {
    return {
      status: "ERROR",
      reason: "Could not create Lightning invoice.",
    }
  }
}

const handleRequest = async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        ...jsonHeaders,
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "content-type",
      },
    })
  }

  if (request.method !== "GET") {
    return jsonResponse(
      {
        status: "ERROR",
        reason: "Method not allowed.",
      },
      { status: 405 }
    )
  }

  const config = loadConfig(request)

  if ("status" in config) {
    return jsonResponse(config, { status: 500 })
  }

  const requestUrl = new URL(request.url)
  const amount = requestUrl.searchParams.get("amount")

  if (amount === null) {
    return jsonResponse(createMetadata(config))
  }

  const parsedAmount = parseAmountMsats(amount)

  if (typeof parsedAmount !== "number") {
    return jsonResponse(parsedAmount, { status: 400 })
  }

  const amountSats = validateAmountMsats(parsedAmount, config)

  if (typeof amountSats !== "number") {
    return jsonResponse(amountSats, { status: 400 })
  }

  return jsonResponse(await createInvoice(amountSats, config))
}

export const GET = handleRequest
export const OPTIONS = handleRequest

export default {
  fetch: handleRequest,
}
