import { describe, expect, test } from "vitest"

import {
  createTestCertificate,
  createTestPkcs12,
} from "@/test/eet-test-certificates.ts"
import {
  readEetCertificateFile,
  readX509Certificate,
} from "./eet-certificate.ts"

const now = new Date("2026-06-05T12:00:00.000Z")
const password = "generated-test-password"

const createCashRegisterCertificate = (
  overrides: Partial<Parameters<typeof createTestCertificate>[0]> = {}
) =>
  createTestCertificate({
    subject: { commonName: "CZ1234567890", description: "test taxpayer" },
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    validTo: new Date("2027-01-01T00:00:00.000Z"),
    ...overrides,
  })

describe("readEetCertificateFile", () => {
  test("reads the EIČ, validity, key and certificate from a .p12", async () => {
    const certificate = await createCashRegisterCertificate()
    const file = await createTestPkcs12({ ...certificate, password })

    const result = await readEetCertificateFile({ file, password, now })

    expect(result).toEqual({
      ok: true,
      value: {
        eic: "CZ1234567890",
        description: "test taxpayer",
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
        validTo: new Date("2027-01-01T00:00:00.000Z"),
        certificateDer: certificate.certificateDer,
        privateKeyPkcs8: certificate.privateKeyPkcs8,
      },
    })
  })

  test("refuses a wrong password", async () => {
    const certificate = await createCashRegisterCertificate()
    const file = await createTestPkcs12({ ...certificate, password })

    const result = await readEetCertificateFile({
      file,
      password: "not-the-password",
      now,
    })

    expect(result).toEqual({
      ok: false,
      error: { type: "EetCertificateWrongPasswordError" },
    })
  })

  test("refuses a file without a private key", async () => {
    const certificate = await createCashRegisterCertificate()
    const file = await createTestPkcs12({
      certificateDer: certificate.certificateDer,
      privateKeyPkcs8: null,
      password,
    })

    const result = await readEetCertificateFile({ file, password, now })

    expect(result).toEqual({
      ok: false,
      error: { type: "EetCertificateWithoutKeyError" },
    })
  })

  test("refuses an expired certificate", async () => {
    const validTo = new Date("2026-06-01T00:00:00.000Z")
    const certificate = await createCashRegisterCertificate({ validTo })
    const file = await createTestPkcs12({ ...certificate, password })

    const result = await readEetCertificateFile({ file, password, now })

    expect(result).toEqual({
      ok: false,
      error: { type: "EetCertificateExpiredError", validTo },
    })
  })

  test("refuses a certificate not yet valid", async () => {
    const validFrom = new Date("2026-07-01T00:00:00.000Z")
    const certificate = await createCashRegisterCertificate({ validFrom })
    const file = await createTestPkcs12({ ...certificate, password })

    const result = await readEetCertificateFile({ file, password, now })

    expect(result).toEqual({
      ok: false,
      error: { type: "EetCertificateNotYetValidError", validFrom },
    })
  })

  test("refuses a certificate that names no EIČ", async () => {
    const certificate = await createCashRegisterCertificate({
      subject: { commonName: "Some shop" },
    })
    const file = await createTestPkcs12({ ...certificate, password })

    const result = await readEetCertificateFile({ file, password, now })

    expect(result).toEqual({
      ok: false,
      error: { type: "EetCertificateWithoutEicError" },
    })
  })

  test("refuses bytes that are not a .p12", async () => {
    const result = await readEetCertificateFile({
      file: new TextEncoder().encode("not a certificate"),
      password,
      now,
    })

    expect(result).toEqual({
      ok: false,
      error: { type: "EetCertificateUnreadableError" },
    })
  })

  test("keeps the file and the password out of every error", async () => {
    const certificate = await createCashRegisterCertificate()
    const file = await createTestPkcs12({ ...certificate, password })

    const result = await readEetCertificateFile({
      file,
      password: "secret-typo",
      now,
    })

    expect(JSON.stringify(result)).not.toContain("secret-typo")
    expect(Object.keys(result.ok ? {} : result.error)).toEqual(["type"])
  })
})

describe("readX509Certificate", () => {
  test("reads the organization of a certificate", async () => {
    const certificate = await createTestCertificate({
      subject: {
        commonName: "EET response signer",
        organization: "Generální finanční ředitelství",
      },
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validTo: new Date("2027-01-01T00:00:00.000Z"),
    })

    expect(readX509Certificate(certificate.certificateDer)).toMatchObject({
      ok: true,
      value: {
        commonName: "EET response signer",
        organization: "Generální finanční ředitelství",
        description: null,
      },
    })
  })
})
