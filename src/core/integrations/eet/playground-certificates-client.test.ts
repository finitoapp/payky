import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { createTestDateDep } from "@/test/date-dep.ts"
import {
  createTestCertificate,
  createTestPkcs12,
} from "@/test/eet-test-certificates.ts"
import { fetchPlaygroundCertificates } from "./playground-certificates-client.ts"

const password = "generated-archive-password"

const answering = (body: unknown, status = 200) => {
  const requestedUrls: string[] = []
  return {
    requestedUrls,
    fetch: async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input))
      return Response.json(body, { status })
    },
  }
}

const createArchiveBody = async () => {
  const certificate = await createTestCertificate({
    subject: { commonName: "CZ1234567890", description: "pravnicka osoba" },
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    validTo: new Date("2027-01-01T00:00:00.000Z"),
  })
  const p12 = await createTestPkcs12({ ...certificate, password })

  return {
    certificate,
    body: {
      password,
      certificates: [
        {
          fileName: "CA_EET-Playground-CZ1234567890.p12",
          p12Base64: Buffer.from(p12).toString("base64"),
        },
      ],
    },
  }
}

describe("fetchPlaygroundCertificates", () => {
  test("lists each official certificate with its EIČ and description", async () => {
    const { certificate, body } = await createArchiveBody()
    const server = answering(body)
    await using run = testCreateRun({ ...server, ...createTestDateDep() })

    const result = await run(fetchPlaygroundCertificates())

    expect(result).toEqual({
      ok: true,
      value: [
        {
          eic: "CZ1234567890",
          description: "pravnicka osoba",
          validFrom: new Date("2026-01-01T00:00:00.000Z"),
          validTo: new Date("2027-01-01T00:00:00.000Z"),
          certificateDer: certificate.certificateDer,
          privateKeyPkcs8: certificate.privateKeyPkcs8,
        },
      ],
    })
    expect(server.requestedUrls).toEqual([
      "https://payky.me/api/eet/playground-certificates",
    ])
  })

  test("reports an unavailable archive without its body", async () => {
    const server = answering({ status: "ERROR" }, 502)
    await using run = testCreateRun({ ...server, ...createTestDateDep() })

    await expect(run(fetchPlaygroundCertificates())).resolves.toMatchObject({
      ok: false,
      error: {
        type: "PlaygroundCertificatesHttpError",
        status: 502,
        responseBody: "",
      },
    })
  })

  test("reports certificates the shipped password does not open", async () => {
    const { body } = await createArchiveBody()
    const server = answering({ ...body, password: "not-the-password" })
    await using run = testCreateRun({ ...server, ...createTestDateDep() })

    const result = await run(fetchPlaygroundCertificates())

    expect(result).toEqual({
      ok: false,
      error: {
        type: "PlaygroundCertificateUnreadableError",
        reason: "EetCertificateWrongPasswordError",
      },
    })
    expect(JSON.stringify(result)).not.toContain("not-the-password")
  })
})
