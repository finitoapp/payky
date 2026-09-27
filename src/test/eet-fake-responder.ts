import type { FetchDep } from "@/core/deps.ts"
import { EET_RESPONSE_SIGNER_ORGANIZATION } from "@/core/integrations/eet/eet-response-verifier.ts"
import { formatEetDateTime } from "@/core/modules/eet/eet-utils.ts"
import {
  createTestCertificate,
  type TestCertificate,
} from "@/test/eet-test-certificates.ts"

const soapNamespace = "http://schemas.xmlsoap.org/soap/envelope/"
const eetNamespace = "http://fs.gov.cz/eet/schema/v4"
const wsseNamespace =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
const wsuNamespace =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"
const dsNamespace = "http://www.w3.org/2000/09/xmldsig#"
const exclusiveC14n = "http://www.w3.org/2001/10/xml-exc-c14n#"
const sha256Digest = "http://www.w3.org/2001/04/xmlenc#sha256"
const rsaSha256Signature = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"
const x509TokenType =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3"
const base64EncodingType =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary"

export interface FakeEetWarning {
  readonly code: number
  readonly message: string
}

export type FakeEetAnswer =
  | {
      readonly type: "confirm"
      readonly warnings?: ReadonlyArray<FakeEetWarning>
    }
  | { readonly type: "error"; readonly code: number; readonly message: string }
  | { readonly type: "soapFault" }
  | { readonly type: "timeout" }
  | { readonly type: "networkFailure" }
  | { readonly type: "tamperedConfirmation" }
  | { readonly type: "confirmBy"; readonly signer: TestCertificate }

export interface FakeEetRequest {
  readonly url: string
  readonly body: string
  readonly header: Readonly<Record<string, string>>
  readonly data: Readonly<Record<string, string>>
}

export interface FakeEetResponder extends FetchDep {
  readonly requests: ReadonlyArray<FakeEetRequest>
  readonly signer: TestCertificate
  readonly answerNext: (...answers: ReadonlyArray<FakeEetAnswer>) => void
}

const toBase64 = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")

const readAttributes = (
  body: string,
  element: string
): Readonly<Record<string, string>> => {
  const match = new RegExp(`<(?:\\w+:)?${element}\\s([^>]*?)/?>`, "u").exec(
    body
  )
  return Object.fromEntries(
    [...(match?.[1] ?? "").matchAll(/(\w+)="([^"]*)"/gu)].map(
      ([, key = "", value = ""]) => [key, value]
    )
  )
}

const warningElements = (warnings: ReadonlyArray<FakeEetWarning>): string =>
  warnings
    .map(
      (warning) =>
        `<eet:Varovani kod_varov="${warning.code}">${escapeXml(warning.message)}</eet:Varovani>`
    )
    .join("")

const unsignedEnvelope = (body: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="${soapNamespace}"><soap:Body>${body}</soap:Body></soap:Envelope>`

const signedEnvelope = async ({
  odpoved,
  signer,
}: {
  readonly odpoved: string
  readonly signer: TestCertificate
}): Promise<string> => {
  const body = `<soap:Body xmlns:soap="${soapNamespace}" xmlns:wsu="${wsuNamespace}" wsu:Id="Body">${odpoved}</soap:Body>`
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))
  )
  const signedInfo = `<ds:SignedInfo xmlns:ds="${dsNamespace}"><ds:CanonicalizationMethod Algorithm="${exclusiveC14n}"></ds:CanonicalizationMethod><ds:SignatureMethod Algorithm="${rsaSha256Signature}"></ds:SignatureMethod><ds:Reference URI="#Body"><ds:Transforms><ds:Transform Algorithm="${exclusiveC14n}"></ds:Transform></ds:Transforms><ds:DigestMethod Algorithm="${sha256Digest}"></ds:DigestMethod><ds:DigestValue>${toBase64(digest)}</ds:DigestValue></ds:Reference></ds:SignedInfo>`
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      signer.privateKey,
      new TextEncoder().encode(signedInfo)
    )
  )
  const envelope = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="${soapNamespace}"><soap:Header><wsse:Security xmlns:wsse="${wsseNamespace}"><wsse:BinarySecurityToken xmlns:wsu="${wsuNamespace}" wsu:Id="X509Token" EncodingType="${base64EncodingType}" ValueType="${x509TokenType}">${toBase64(signer.certificateDer)}</wsse:BinarySecurityToken><ds:Signature xmlns:ds="${dsNamespace}">${signedInfo}<ds:SignatureValue>${toBase64(signature)}</ds:SignatureValue><ds:KeyInfo><wsse:SecurityTokenReference><wsse:Reference URI="#X509Token" ValueType="${x509TokenType}"/></wsse:SecurityTokenReference></ds:KeyInfo></ds:Signature></wsse:Security></soap:Header>${body}</soap:Envelope>`

  return envelope
}

const xmlResponse = (body: string, status = 200): Response =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/xml; charset=utf-8",
      "x-global-transaction-id": `fake-${crypto.randomUUID()}`,
    },
  })

const waitForAbort = (signal: AbortSignal | null | undefined): Promise<never> =>
  new Promise((_, reject) => {
    signal?.addEventListener("abort", () => {
      reject(new DOMException("The operation was aborted.", "AbortError"))
    })
  })

export const createFakeEetResponder = async ({
  now = () => new Date(),
  test = true,
}: {
  readonly now?: () => Date
  readonly test?: boolean
} = {}): Promise<FakeEetResponder> => {
  const signer = await createTestCertificate({
    subject: {
      commonName: "Fake EET response signer",
      organization: EET_RESPONSE_SIGNER_ORGANIZATION,
    },
    validFrom: new Date("2020-01-01T00:00:00.000Z"),
    validTo: new Date("2040-01-01T00:00:00.000Z"),
  })
  const requests: FakeEetRequest[] = []
  const queuedAnswers: FakeEetAnswer[] = []
  const testAttribute = ` test="${test}"`

  const confirm = async (
    uuid: string,
    options: {
      readonly warnings?: ReadonlyArray<FakeEetWarning>
      readonly signer?: TestCertificate
    }
  ): Promise<string> => {
    const pok = `${crypto.randomUUID()}-${test ? "ff" : "01"}`
    const odpoved = `<eet:Odpoved xmlns:eet="${eetNamespace}"><eet:Hlavicka dat_prij="${formatEetDateTime(now())}" uuid_zpravy="${uuid}"></eet:Hlavicka><eet:Potvrzeni pok="${pok}"${testAttribute}></eet:Potvrzeni>${warningElements(options.warnings ?? [])}</eet:Odpoved>`
    return await signedEnvelope({ odpoved, signer: options.signer ?? signer })
  }

  const respond = async (
    answer: FakeEetAnswer,
    request: FakeEetRequest,
    signal: AbortSignal | null | undefined
  ): Promise<Response> => {
    const uuid = request.header.uuid_zpravy ?? ""

    if (request.header.overeni === "true" && answer.type === "confirm") {
      return xmlResponse(
        unsignedEnvelope(
          `<eet:Odpoved xmlns:eet="${eetNamespace}"><eet:Hlavicka dat_odmit="${formatEetDateTime(now())}" uuid_zpravy="${uuid}"></eet:Hlavicka><eet:Chyba kod="0"${testAttribute}>Datovou zpravu evidovane trzby v overovacim modu se podarilo zpracovat</eet:Chyba>${warningElements(answer.warnings ?? [])}</eet:Odpoved>`
        )
      )
    }

    switch (answer.type) {
      case "confirm":
        return xmlResponse(await confirm(uuid, answer))
      case "confirmBy":
        return xmlResponse(await confirm(uuid, { signer: answer.signer }))
      case "tamperedConfirmation":
        return xmlResponse(
          (await confirm(uuid, {})).replace(/-(ff|01)"/u, '-0e"')
        )
      case "error":
        return xmlResponse(
          unsignedEnvelope(
            `<eet:Odpoved xmlns:eet="${eetNamespace}"><eet:Hlavicka dat_odmit="${formatEetDateTime(now())}" uuid_zpravy="${uuid}"></eet:Hlavicka><eet:Chyba kod="${answer.code}"${testAttribute}>${escapeXml(answer.message)}</eet:Chyba></eet:Odpoved>`
          )
        )
      case "soapFault":
        return xmlResponse(
          unsignedEnvelope(
            "<soap:Fault><faultcode>soap:Server</faultcode><faultstring>Fake EET is unavailable</faultstring></soap:Fault>"
          ),
          500
        )
      case "timeout":
        return await waitForAbort(signal)
      case "networkFailure":
        throw new TypeError("fetch failed")
    }
  }

  return {
    requests,
    signer,
    answerNext: (...answers) => {
      queuedAnswers.push(...answers)
    },
    fetch: async (input, init) => {
      const request = new Request(input, init)
      const body = await request.text()
      const fakeRequest = {
        url: request.url,
        body,
        header: readAttributes(body, "Hlavicka"),
        data: readAttributes(body, "Data"),
      }
      requests.push(fakeRequest)

      return await respond(
        queuedAnswers.shift() ?? { type: "confirm" },
        fakeRequest,
        init?.signal
      )
    },
  }
}
