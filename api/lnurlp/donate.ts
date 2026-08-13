import { err, ok, type Result } from "@evolu/common"
import { z } from "zod"
import {
  createDonateWallet,
  type DonateWallet,
} from "../../src/core/server/donate-wallet.js"

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
  readonly verify: string
}

interface LnurlVerifyResponse {
  readonly status: "OK"
  readonly settled: boolean
  readonly preimage: string | null
  readonly pr: string
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

const loadConfig = (request: Request): Result<DonateConfig, LnurlError> => {
  const parsedEnv = EnvSchema.safeParse(process.env)

  if (!parsedEnv.success) {
    return err({
      status: "ERROR",
      reason: "Donation endpoint is not configured.",
    })
  }

  const env = parsedEnv.data

  return ok({
    mnemonic: env.PAYKY_DONATE_SPARK_MNEMONIC,
    minSendableMsats: env.PAYKY_DONATE_MIN_SATS * MSATS_PER_SAT,
    maxSendableMsats: env.PAYKY_DONATE_MAX_SATS * MSATS_PER_SAT,
    description: env.PAYKY_DONATE_DESCRIPTION,
    identifier: env.PAYKY_DONATE_IDENTIFIER ?? getDefaultIdentifier(request),
    callbackUrl:
      env.PAYKY_DONATE_CALLBACK_URL ??
      `${getRequestOrigin(request)}/.well-known/lnurlp/donate`,
    invoiceExpirySeconds: env.PAYKY_DONATE_INVOICE_EXPIRY_SECONDS,
  })
}

const jsonResponse = (
  body: LnurlPayMetadata | LnurlPayInvoice | LnurlVerifyResponse | LnurlError,
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

const parseAmountMsats = (value: string | null): Result<number, LnurlError> => {
  if (value === null) {
    return err({
      status: "ERROR",
      reason: "Missing amount.",
    })
  }

  const amount = Number(value)

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return err({
      status: "ERROR",
      reason: "Amount must be a positive integer in millisatoshi.",
    })
  }

  return ok(amount)
}

const validateAmountMsats = (
  amountMsats: number,
  config: DonateConfig
): Result<number, LnurlError> => {
  if (
    amountMsats < config.minSendableMsats ||
    amountMsats > config.maxSendableMsats
  ) {
    return err({
      status: "ERROR",
      reason: "Amount is outside the allowed donation range.",
    })
  }

  if (amountMsats % MSATS_PER_SAT !== 0) {
    return err({
      status: "ERROR",
      reason: "Amount must be divisible by 1000 millisatoshi.",
    })
  }

  return ok(amountMsats / MSATS_PER_SAT)
}

const getVerifyUrl = (callbackUrl: string, id: string): string => {
  const verifyUrl = new URL(callbackUrl)
  verifyUrl.search = ""
  verifyUrl.searchParams.set("verify", id)

  return verifyUrl.toString()
}

const createInvoice = async (
  amountSats: number,
  config: DonateConfig
): Promise<Result<LnurlPayInvoice, LnurlError>> => {
  let wallet: DonateWallet | undefined

  try {
    wallet = await createDonateWallet(config)

    const invoice = await wallet.createLightningInvoice({
      amountSats,
      memo: config.description,
      expirySeconds: config.invoiceExpirySeconds,
      includeSparkInvoice: false,
    })

    if (invoice.id === undefined || invoice.id.trim().length === 0) {
      return err({
        status: "ERROR",
        reason: "Could not create verifiable Lightning invoice.",
      })
    }

    return ok({
      pr: invoice.invoice.encodedInvoice,
      routes: [],
      verify: getVerifyUrl(config.callbackUrl, invoice.id),
    })
  } catch {
    return err({
      status: "ERROR",
      reason: "Could not create Lightning invoice.",
    })
  } finally {
    await wallet?.cleanup()
  }
}

const isSettledLightningReceiveStatus = (status: string): boolean =>
  status === "LIGHTNING_PAYMENT_RECEIVED" ||
  status === "PAYMENT_PREIMAGE_RECOVERED" ||
  status === "TRANSFER_COMPLETED"

const verifyInvoice = async (
  id: string,
  config: DonateConfig
): Promise<Result<LnurlVerifyResponse, LnurlError>> => {
  let wallet: DonateWallet | undefined

  try {
    wallet = await createDonateWallet(config)

    const invoice = await wallet.getLightningReceiveRequest(id)

    if (invoice === null) {
      return err({
        status: "ERROR",
        reason: "Not found",
      })
    }

    const preimage =
      invoice.paymentPreimage === undefined ||
      invoice.paymentPreimage.trim().length === 0
        ? null
        : invoice.paymentPreimage

    return ok({
      status: "OK",
      settled:
        preimage !== null || isSettledLightningReceiveStatus(invoice.status),
      preimage,
      pr: invoice.invoice.encodedInvoice,
    })
  } catch {
    return err({
      status: "ERROR",
      reason: "Could not verify Lightning invoice.",
    })
  } finally {
    await wallet?.cleanup()
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

  const configResult = loadConfig(request)

  if (!configResult.ok) {
    return jsonResponse(configResult.error, { status: 500 })
  }

  const config = configResult.value
  const requestUrl = new URL(request.url)
  const verify = requestUrl.searchParams.get("verify")

  if (verify !== null) {
    if (verify.trim().length === 0) {
      return jsonResponse(
        {
          status: "ERROR",
          reason: "Not found",
        },
        { status: 404 }
      )
    }

    const verifyResult = await verifyInvoice(verify, config)

    return jsonResponse(
      verifyResult.ok ? verifyResult.value : verifyResult.error,
      {
        status:
          !verifyResult.ok && verifyResult.error.reason === "Not found"
            ? 404
            : 200,
      }
    )
  }

  const amount = requestUrl.searchParams.get("amount")

  if (amount === null) {
    return jsonResponse(createMetadata(config))
  }

  const parsedAmountResult = parseAmountMsats(amount)

  if (!parsedAmountResult.ok) {
    return jsonResponse(parsedAmountResult.error, { status: 400 })
  }

  const amountSatsResult = validateAmountMsats(parsedAmountResult.value, config)

  if (!amountSatsResult.ok) {
    return jsonResponse(amountSatsResult.error, { status: 400 })
  }

  const invoiceResult = await createInvoice(amountSatsResult.value, config)

  return jsonResponse(
    invoiceResult.ok ? invoiceResult.value : invoiceResult.error
  )
}

export const GET = handleRequest
export const OPTIONS = handleRequest

export default {
  fetch: handleRequest,
}
