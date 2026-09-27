import type { EetVerifySignatureInput } from "@finitoapp/eet-client"
import { describe, expect, test } from "vitest"

import {
  createTestCertificate,
  type TestCertificateSubject,
} from "@/test/eet-test-certificates.ts"
import {
  createEetResponseVerifier,
  EET_RESPONSE_SIGNER_ORGANIZATION,
} from "./eet-response-verifier.ts"

const now = new Date("2026-06-05T12:00:00.000Z")
const verifier = createEetResponseVerifier({ date: { now: () => now } })
const signedInfoCanonical = new TextEncoder().encode("<ds:SignedInfo/>")

const signedBy = async ({
  subject = {
    commonName: "EET response signer",
    organization: EET_RESPONSE_SIGNER_ORGANIZATION,
  },
  validTo = new Date("2027-01-01T00:00:00.000Z"),
  signedBytes = signedInfoCanonical,
}: {
  readonly subject?: TestCertificateSubject
  readonly validTo?: Date
  readonly signedBytes?: Uint8Array
} = {}): Promise<EetVerifySignatureInput> => {
  const signer = await createTestCertificate({
    subject,
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    validTo,
  })
  const signatureValue = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      signer.privateKey,
      signedBytes as BufferSource
    )
  )

  return {
    raw: "",
    signature: {
      signedBodyCanonical: new Uint8Array(),
      signedInfoCanonical,
      signatureValue,
      digestValue: new Uint8Array(),
      certificates: [signer.certificateDer],
      canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#",
      digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
      signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    },
  }
}

describe("createEetResponseVerifier", () => {
  test("accepts a signature by a valid GFŘ certificate", async () => {
    await expect(verifier.verify(await signedBy())).resolves.toBe(true)
  })

  test("refuses a certificate of another organization", async () => {
    const input = await signedBy({
      subject: { commonName: "EET", organization: "Somebody else" },
    })

    await expect(verifier.verify(input)).resolves.toBe(false)
  })

  test("refuses an expired certificate", async () => {
    const input = await signedBy({
      validTo: new Date("2026-06-01T00:00:00.000Z"),
    })

    await expect(verifier.verify(input)).resolves.toBe(false)
  })

  test("refuses a signature over other bytes", async () => {
    const input = await signedBy({
      signedBytes: new TextEncoder().encode(
        "<ds:SignedInfo>forged</ds:SignedInfo>"
      ),
    })

    await expect(verifier.verify(input)).resolves.toBe(false)
  })

  test("refuses a response without a certificate", async () => {
    const input = await signedBy()

    await expect(
      verifier.verify({
        ...input,
        signature: { ...input.signature, certificates: [] },
      })
    ).resolves.toBe(false)
  })
})
