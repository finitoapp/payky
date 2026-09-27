import type { EetError, EetSubmitOutcome, Result } from "@finitoapp/eet-client"

import { appEnv } from "@/core/app-env.ts"
import type { DateDep, FetchDep } from "@/core/deps.ts"
import type {
  EetEnvironment,
  EetWarning,
} from "@/core/modules/eet/eet-types.ts"

export interface EetReceipt {
  readonly eic: string
  readonly establishmentId: string
  readonly cashRegisterId: string
  readonly sequenceNumber: string
  readonly saleAt: string
  readonly totalAmount: string
}

export interface EetSigningCertificate {
  readonly certificateDer: Uint8Array
  readonly privateKeyPkcs8: Uint8Array
}

interface EetFailure {
  readonly unanswered: boolean
  readonly errorType: string
  readonly code: number | null
  readonly message: string
  readonly globalTransactionId: string | null
}

export type EetDeliveryOutcome =
  | {
      readonly type: "accepted"
      readonly pok: string
      readonly receivedAt: string
      readonly isTest: boolean
      readonly warnings: ReadonlyArray<EetWarning>
      readonly messageUuid: string
      readonly globalTransactionId: string | null
    }
  | {
      readonly type: "verified"
      readonly isTest: boolean
      readonly warnings: ReadonlyArray<EetWarning>
      readonly globalTransactionId: string | null
    }
  | ({ readonly type: "retry" | "rejected" } & EetFailure)

export interface EetSubmission {
  readonly outcome: EetDeliveryOutcome
  readonly rawRequest: string | null
  readonly rawResponse: string | null
}

export interface EetApi {
  readonly isProductionAvailable: boolean
  readonly submit: (input: {
    readonly environment: EetEnvironment
    readonly certificate: EetSigningCertificate
    readonly receipt: EetReceipt
    readonly firstSubmission: boolean
    readonly verification: boolean
  }) => Promise<EetSubmission>
}

export interface EetApiDep {
  readonly eetApi: EetApi
}

const EET_REQUEST_TIMEOUT_MS = 10_000

const EET_ERROR_CODE_TYPE = "EetErrorCode"

export const isEetProductionConfigured =
  appEnv.VITE_PAYKY_EET_PRODUCTION_URL !== undefined

const RETRYABLE_EET_ERROR_CODES: ReadonlyArray<number> = [-1, 8]

const eetErrorDispositions = {
  EetNetworkError: { retry: true, unanswered: true },
  EetTimeoutError: { retry: true, unanswered: true },
  EetHttpError: { retry: true, unanswered: true },
  EetSoapFaultError: { retry: true, unanswered: true },
  EetXmlError: { retry: true, unanswered: true },
  EetResponseSchemaError: { retry: true, unanswered: true },
  EetSignatureError: { retry: false, unanswered: true },
  EetValidationError: { retry: false, unanswered: false },
  EetMessageTooLargeError: { retry: false, unanswered: false },
  EetSignerError: { retry: false, unanswered: false },
} satisfies Record<
  EetError["type"],
  { readonly retry: boolean; readonly unanswered: boolean }
>

const toWarnings = (
  warnings: ReadonlyArray<{ readonly code: number; readonly message?: string }>
): ReadonlyArray<EetWarning> =>
  warnings.map(({ code, message }) =>
    message === undefined ? { code } : { code, message }
  )

const toEetDeliveryOutcome = (
  result: Result<EetSubmitOutcome, EetError>
): EetDeliveryOutcome => {
  if (!result.ok) {
    const { error } = result
    const { retry, unanswered } = eetErrorDispositions[error.type]
    return {
      type: retry ? "retry" : "rejected",
      unanswered,
      errorType: error.type,
      code: null,
      message: error.message,
      globalTransactionId:
        "globalTransactionId" in error
          ? (error.globalTransactionId ?? null)
          : null,
    }
  }

  const outcome = result.value
  const globalTransactionId = outcome.globalTransactionId ?? null
  switch (outcome.status) {
    case "accepted":
      return {
        type: "accepted",
        pok: outcome.pok,
        receivedAt: outcome.receivedAt,
        isTest: outcome.test,
        warnings: toWarnings(outcome.warnings),
        messageUuid: outcome.uuid,
        globalTransactionId,
      }
    case "verification":
      return {
        type: "verified",
        isTest: outcome.test,
        warnings: toWarnings(outcome.warnings),
        globalTransactionId,
      }
    case "rejected":
      return {
        type: RETRYABLE_EET_ERROR_CODES.includes(outcome.code)
          ? "retry"
          : "rejected",
        unanswered: false,
        errorType: EET_ERROR_CODE_TYPE,
        code: outcome.code,
        message: outcome.message,
        globalTransactionId,
      }
  }
}

const failedLocally = ({
  type,
  errorType,
  message,
}: {
  readonly type: "retry" | "rejected"
  readonly errorType: string
  readonly message: string
}): EetSubmission => ({
  outcome: {
    type,
    unanswered: false,
    errorType,
    code: null,
    message,
    globalTransactionId: null,
  },
  rawRequest: null,
  rawResponse: null,
})

const requestBodyText = (body: BodyInit | null | undefined): string | null => {
  if (typeof body === "string") return body
  if (body instanceof Uint8Array) return new TextDecoder().decode(body)
  return null
}

export const createEetApiDep = (
  deps: FetchDep & DateDep,
  {
    productionUrl = appEnv.VITE_PAYKY_EET_PRODUCTION_URL,
    timeoutMs = EET_REQUEST_TIMEOUT_MS,
  }: {
    readonly productionUrl?: string | undefined
    readonly timeoutMs?: number
  } = {}
): EetApiDep => ({
  eetApi: {
    isProductionAvailable: productionUrl !== undefined,
    submit: async ({
      environment,
      certificate,
      receipt,
      firstSubmission,
      verification,
    }) => {
      const [
        sdk,
        { parseEetReceiptData },
        { createEetResponseVerifier },
        { importEetSigningKey },
      ] = await Promise.all([
        import("@finitoapp/eet-client"),
        import("@finitoapp/eet-client/builtin"),
        import("./eet-response-verifier.ts"),
        import("./eet-certificate.ts"),
      ])
      const endpoint =
        environment === "playground"
          ? sdk.EetEndpoint.playground
          : productionUrl
      if (endpoint === undefined) {
        return failedLocally({
          type: "retry",
          errorType: "EetProductionUnavailable",
          message: "This build has no EET production endpoint.",
        })
      }

      const data = parseEetReceiptData({
        eic_popl: receipt.eic,
        id_jednotky: receipt.establishmentId,
        id_pokl: receipt.cashRegisterId,
        porad_cis: receipt.sequenceNumber,
        dat_trzby: receipt.saleAt,
        celk_trzba: receipt.totalAmount,
      })
      if (!data.ok) {
        return failedLocally({
          type: "rejected",
          errorType: data.error.type,
          message: data.error.issues.join("; "),
        })
      }

      const privateKey = await importEetSigningKey(certificate.privateKeyPkcs8)
      if (privateKey === null) {
        return failedLocally({
          type: "rejected",
          errorType: "EetSignerError",
          message: "The stored private key cannot sign.",
        })
      }

      let rawRequest: string | null = null
      let rawResponse: string | null = null
      const client = sdk.createEetClient({
        endpoint,
        signer: sdk.createCryptoKeySigner(
          certificate.certificateDer,
          privateKey
        ),
        responseSignatureVerifier: createEetResponseVerifier(deps),
        fetch: async (input, init) => {
          rawRequest = requestBodyText(init?.body)
          const response = await deps.fetch(input, init)
          rawResponse = await response.clone().text()
          return response
        },
        timeoutMs,
      })
      const result = await client.submit(data.value, {
        firstSubmission,
        verification,
      })

      return {
        outcome: toEetDeliveryOutcome(result),
        rawRequest,
        rawResponse,
      }
    },
  },
})
