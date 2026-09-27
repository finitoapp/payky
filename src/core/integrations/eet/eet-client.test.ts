import { beforeAll, describe, expect, test } from "vitest"

import { createFakeEetResponder } from "@/test/eet-fake-responder.ts"
import {
  createTestCertificate,
  type TestCertificate,
} from "@/test/eet-test-certificates.ts"
import { createEetApiDep, type EetReceipt } from "./eet-client.ts"

const receipt: EetReceipt = {
  eic: "CZ1234567890",
  establishmentId: "24",
  cashRegisterId: "fake-register",
  sequenceNumber: "fake-sale-1",
  saleAt: "2026-06-05T14:00:00+02:00",
  totalAmount: "250.00",
}

let cashRegister: TestCertificate

beforeAll(async () => {
  cashRegister = await createTestCertificate({
    subject: { commonName: "CZ1234567890" },
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    validTo: new Date("2027-01-01T00:00:00.000Z"),
  })
})

const submitTo = async (
  responder: Awaited<ReturnType<typeof createFakeEetResponder>>,
  overrides: { readonly verification?: boolean; readonly now?: Date } = {}
) => {
  const { eetApi } = createEetApiDep(
    {
      fetch: responder.fetch,
      date: { now: () => overrides.now ?? new Date() },
    },
    { productionUrl: undefined, timeoutMs: 200 }
  )

  return await eetApi.submit({
    environment: "playground",
    certificate: cashRegister,
    receipt,
    firstSubmission: true,
    verification: overrides.verification ?? false,
  })
}

describe("createEetApiDep", () => {
  test("maps a signed confirmation to accepted, keeping every warning", async () => {
    const responder = await createFakeEetResponder()
    responder.answerNext({
      type: "confirm",
      warnings: [{ code: 4, message: "dat_trzby is in the future" }],
    })

    const submission = await submitTo(responder)

    expect(submission.outcome).toMatchObject({
      type: "accepted",
      pok: expect.stringMatching(/-ff$/u),
      isTest: true,
      warnings: [{ code: 4, message: "dat_trzby is in the future" }],
      messageUuid: responder.requests[0]?.header.uuid_zpravy,
      globalTransactionId: expect.stringMatching(/^fake-/u),
    })
    expect(submission.rawRequest).toContain("<tns:Trzba")
    expect(submission.rawResponse).toContain("<eet:Potvrzeni")
  })

  test("maps a verification-mode answer to verified", async () => {
    const responder = await createFakeEetResponder()

    const submission = await submitTo(responder, { verification: true })

    expect(submission.outcome).toMatchObject({ type: "verified", isTest: true })
    expect(responder.requests[0]?.header.overeni).toBe("true")
  })

  test.each([-1, 8])(
    "keeps EET error %i retryable with the answer received",
    async (code) => {
      const responder = await createFakeEetResponder()
      responder.answerNext({ type: "error", code, message: "Try later" })

      const submission = await submitTo(responder)

      expect(submission.outcome).toEqual({
        type: "retry",
        unanswered: false,
        errorType: "EetErrorCode",
        code,
        message: "Try later",
        globalTransactionId: expect.stringMatching(/^fake-/u),
      })
    }
  )

  test.each([2, 3, 4, 6, 7])("rejects on EET error %i", async (code) => {
    const responder = await createFakeEetResponder()
    responder.answerNext({ type: "error", code, message: "Refused" })

    const submission = await submitTo(responder)

    expect(submission.outcome).toMatchObject({
      type: "rejected",
      errorType: "EetErrorCode",
      code,
      message: "Refused",
    })
  })

  test.each([
    ["timeout", "EetTimeoutError"],
    ["networkFailure", "EetNetworkError"],
    ["soapFault", "EetSoapFaultError"],
  ] as const)("retries an unanswered %s", async (answer, errorType) => {
    const responder = await createFakeEetResponder()
    responder.answerNext({ type: answer })

    const submission = await submitTo(responder)

    expect(submission.outcome).toMatchObject({
      type: "retry",
      unanswered: true,
      errorType,
      code: null,
    })
  })

  test("rejects a confirmation whose body was changed after signing", async () => {
    const responder = await createFakeEetResponder()
    responder.answerNext({ type: "tamperedConfirmation" })

    const submission = await submitTo(responder)

    expect(submission.outcome).toMatchObject({
      type: "rejected",
      unanswered: true,
      errorType: "EetSignatureError",
    })
  })

  test("rejects a confirmation signed by someone other than GFŘ", async () => {
    const responder = await createFakeEetResponder()
    const stranger = await createTestCertificate({
      subject: { commonName: "EET", organization: "Somebody else" },
      validFrom: new Date("2020-01-01T00:00:00.000Z"),
      validTo: new Date("2040-01-01T00:00:00.000Z"),
    })
    responder.answerNext({ type: "confirmBy", signer: stranger })

    const submission = await submitTo(responder)

    expect(submission.outcome).toMatchObject({
      type: "rejected",
      errorType: "EetSignatureError",
    })
  })

  test("rejects a confirmation signed by an expired GFŘ certificate", async () => {
    const responder = await createFakeEetResponder()
    const expired = await createTestCertificate({
      subject: {
        commonName: "EET",
        organization: "Generální finanční ředitelství",
      },
      validFrom: new Date("2020-01-01T00:00:00.000Z"),
      validTo: new Date("2021-01-01T00:00:00.000Z"),
    })
    responder.answerNext({ type: "confirmBy", signer: expired })

    const submission = await submitTo(responder)

    expect(submission.outcome).toMatchObject({
      type: "rejected",
      errorType: "EetSignatureError",
    })
  })

  test("rejects a receipt EET would refuse without sending it", async () => {
    const responder = await createFakeEetResponder()
    const { eetApi } = createEetApiDep(
      { fetch: responder.fetch, date: { now: () => new Date() } },
      { productionUrl: undefined }
    )

    const submission = await eetApi.submit({
      environment: "playground",
      certificate: cashRegister,
      receipt: { ...receipt, establishmentId: "024" },
      firstSubmission: true,
      verification: false,
    })

    expect(submission.outcome).toMatchObject({
      type: "rejected",
      errorType: "EetValidationError",
    })
    expect(responder.requests).toEqual([])
  })

  test("rejects locally a stored private key that cannot sign", async () => {
    const responder = await createFakeEetResponder()
    const { eetApi } = createEetApiDep(
      { fetch: responder.fetch, date: { now: () => new Date() } },
      { productionUrl: undefined }
    )

    const submission = await eetApi.submit({
      environment: "playground",
      certificate: { ...cashRegister, privateKeyPkcs8: new Uint8Array([1]) },
      receipt,
      firstSubmission: true,
      verification: false,
    })

    expect(submission.outcome).toMatchObject({
      type: "rejected",
      unanswered: false,
      errorType: "EetSignerError",
    })
    expect(responder.requests).toEqual([])
  })

  test("keeps a production sale pending in a build without production", async () => {
    const responder = await createFakeEetResponder()
    const { eetApi } = createEetApiDep(
      { fetch: responder.fetch, date: { now: () => new Date() } },
      { productionUrl: undefined }
    )

    const submission = await eetApi.submit({
      environment: "production",
      certificate: cashRegister,
      receipt,
      firstSubmission: true,
      verification: false,
    })

    expect(eetApi.isProductionAvailable).toBe(false)
    expect(submission.outcome).toMatchObject({
      type: "retry",
      unanswered: false,
      errorType: "EetProductionUnavailable",
    })
    expect(responder.requests).toEqual([])
  })

  test("sends production sales to the configured production URL", async () => {
    const responder = await createFakeEetResponder({ test: false })
    const { eetApi } = createEetApiDep(
      { fetch: responder.fetch, date: { now: () => new Date() } },
      { productionUrl: "https://eet.invalid/production" }
    )

    const submission = await eetApi.submit({
      environment: "production",
      certificate: cashRegister,
      receipt,
      firstSubmission: false,
      verification: false,
    })

    expect(submission.outcome).toMatchObject({
      type: "accepted",
      isTest: false,
    })
    expect(responder.requests).toMatchObject([
      {
        url: "https://eet.invalid/production",
        header: { prvni_zaslani: "false" },
      },
    ])
  })
})
