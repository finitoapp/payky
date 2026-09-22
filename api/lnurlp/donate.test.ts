import { afterEach, describe, expect, test, vi } from "vitest"
import type { DonateWallet } from "../../src/core/server/donate-wallet.js"
import { GET } from "./donate.ts"

vi.mock("../../src/core/server/donate-wallet.js", () => ({
  createDonateWallet: vi.fn(),
}))

const { createDonateWallet } = await import(
  "../../src/core/server/donate-wallet.js"
)

/**
 * The env is read per request, so every case states the whole donation
 * configuration — including the two optional variables, which must be absent
 * unless a case is about them.
 */
const stubEnv = (
  overrides: Readonly<Record<string, string | undefined>> = {}
): void => {
  vi.stubEnv("PAYKY_DONATE_SPARK_MNEMONIC", "test mnemonic")
  vi.stubEnv("PAYKY_DONATE_CALLBACK_URL", undefined)
  vi.stubEnv("PAYKY_DONATE_IDENTIFIER", undefined)

  for (const [name, value] of Object.entries(overrides)) {
    vi.stubEnv(name, value)
  }
}

const spoofedRequest = (url = "https://payky.test/.well-known/lnurlp/donate") =>
  new Request(url, {
    headers: {
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "http",
    },
  })

interface MetadataBody {
  readonly callback: string
  readonly metadata: string
}

const identifierOf = (body: MetadataBody): string | undefined => {
  const entries = JSON.parse(body.metadata) as ReadonlyArray<readonly string[]>

  return entries.find(([kind]) => kind === "text/identifier")?.[1]
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.mocked(createDonateWallet).mockReset()
})

describe("LNURL-pay origin handling", () => {
  test("builds the callback from the request URL, not the forwarded host", async () => {
    stubEnv()

    const body = (await (await GET(spoofedRequest())).json()) as MetadataBody

    expect(body.callback).toBe("https://payky.test/.well-known/lnurlp/donate")
    expect(identifierOf(body)).toBe("donate@payky.test")
  })

  test("prefers the configured callback URL and takes the identifier from it", async () => {
    stubEnv({
      PAYKY_DONATE_CALLBACK_URL: "https://donate.payky.test/lnurlp",
    })

    const body = (await (await GET(spoofedRequest())).json()) as MetadataBody

    expect(body.callback).toBe("https://donate.payky.test/lnurlp")
    expect(identifierOf(body)).toBe("donate@donate.payky.test")
  })

  test("prefers an explicitly configured identifier", async () => {
    stubEnv({ PAYKY_DONATE_IDENTIFIER: "tips@payky.test" })

    const body = (await (await GET(spoofedRequest())).json()) as MetadataBody

    expect(identifierOf(body)).toBe("tips@payky.test")
  })

  test("builds the LUD-21 verify URL from the request URL too", async () => {
    stubEnv()
    const cleanup = vi.fn().mockResolvedValue(undefined)
    vi.mocked(createDonateWallet).mockResolvedValue({
      createLightningInvoice: () =>
        Promise.resolve({
          id: "invoice-id",
          invoice: { encodedInvoice: "lnbc10n1" },
        }),
      cleanup,
    } as unknown as DonateWallet)

    const response = await GET(
      spoofedRequest("https://payky.test/.well-known/lnurlp/donate?amount=1000")
    )

    expect(await response.json()).toMatchObject({
      pr: "lnbc10n1",
      verify: "https://payky.test/.well-known/lnurlp/donate?verify=invoice-id",
    })
    expect(cleanup).toHaveBeenCalledOnce()
  })
})
