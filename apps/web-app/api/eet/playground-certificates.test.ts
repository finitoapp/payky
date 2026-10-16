import { strToU8, zipSync } from "fflate"
import { describe, expect, test } from "vitest"

import {
  handlePlaygroundCertificatesRequest,
  PLAYGROUND_CERTIFICATES_ARCHIVE_URL,
} from "./playground-certificates.ts"

const generatedP12 = new Uint8Array([48, 130, 1, 2, 3, 4, 5])

const buildArchive = (files: Record<string, Uint8Array>): Uint8Array =>
  zipSync(files)

const serving = (body: Uint8Array | null, status = 200) => {
  const requestedUrls: string[] = []
  const fetchArchive: typeof fetch = async (input) => {
    requestedUrls.push(String(input))
    return new Response(body === null ? null : Buffer.from(body), { status })
  }
  return { fetchArchive, requestedUrls }
}

const get = (fetchArchive: typeof fetch) =>
  handlePlaygroundCertificatesRequest(
    new Request("https://payky.me/api/eet/playground-certificates"),
    fetchArchive
  )

describe("handlePlaygroundCertificatesRequest", () => {
  test("returns every certificate with the password from the fixed archive", async () => {
    const { fetchArchive, requestedUrls } = serving(
      buildArchive({
        "CA_EET-Playground-CZ1234567890.p12": generatedP12,
        "ca_eet-root_cert-playground.crt": strToU8("root"),
        "password_pokladni_cert_playground.txt": strToU8("generated\r\n"),
      })
    )

    const response = await get(fetchArchive)

    expect(response.status).toBe(200)
    expect(response.headers.get("access-control-allow-origin")).toBe("*")
    await expect(response.json()).resolves.toEqual({
      password: "generated",
      certificates: [
        {
          fileName: "CA_EET-Playground-CZ1234567890.p12",
          p12Base64: Buffer.from(generatedP12).toString("base64"),
        },
      ],
    })
    expect(requestedUrls).toEqual([PLAYGROUND_CERTIFICATES_ARCHIVE_URL])
  })

  test("answers 502 when the tax administrator's server fails", async () => {
    const response = await get(serving(null, 404).fetchArchive)

    expect(response.status).toBe(502)
  })

  test("answers 502 when the server cannot be reached", async () => {
    const response = await get(async () => {
      throw new TypeError("fetch failed")
    })

    expect(response.status).toBe(502)
  })

  test("answers 502 for an archive without a password file", async () => {
    const response = await get(
      serving(
        buildArchive({ "CA_EET-Playground-CZ1234567890.p12": generatedP12 })
      ).fetchArchive
    )

    expect(response.status).toBe(502)
  })

  test("answers 502 for an archive without a certificate", async () => {
    const response = await get(
      serving(
        buildArchive({
          "password_pokladni_cert_playground.txt": strToU8("generated"),
        })
      ).fetchArchive
    )

    expect(response.status).toBe(502)
  })

  test("answers 502 for bytes that are not an archive", async () => {
    const response = await get(
      serving(strToU8("<html>maintenance</html>")).fetchArchive
    )

    expect(response.status).toBe(502)
  })

  test("takes no parameters and forwards nothing", async () => {
    const { fetchArchive, requestedUrls } = serving(null, 500)

    await handlePlaygroundCertificatesRequest(
      new Request(
        "https://payky.me/api/eet/playground-certificates?url=https://example.com"
      ),
      fetchArchive
    )

    expect(requestedUrls).toEqual([PLAYGROUND_CERTIFICATES_ARCHIVE_URL])
  })

  test("refuses other methods", async () => {
    const response = await handlePlaygroundCertificatesRequest(
      new Request("https://payky.me/api/eet/playground-certificates", {
        method: "POST",
      }),
      serving(null).fetchArchive
    )

    expect(response.status).toBe(405)
  })
})
