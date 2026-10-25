import { sha256 } from "@noble/hashes/sha2.js"
import { hex } from "@scure/base"
import { createTestInvoice } from "../../modules/shared/lightning-invoice-test-fixtures.ts"
import { MSATS_PER_SAT } from "./lnurl-client.ts"

interface FakeInvoice {
  readonly pr: string
  readonly preimage: string
  paid: boolean
}

export interface FakeLightningAddressWallet {
  /** The wallet's answer to `input`, or `null` when it is not addressed to it. */
  readonly fetch: (input: RequestInfo | URL) => Promise<Response | null>
  /** A customer paid `invoice`; `false` when the wallet never issued it. */
  readonly pay: (invoice: string) => boolean
  /**
   * What the wallet supports, changeable at any time: `verify` puts a LUD-21
   * URL on its invoices, `revealsPreimage` makes verify answer with the
   * preimage once paid (ZEUS Pay, for one, does not).
   */
  readonly options: { verify: boolean; revealsPreimage: boolean }
}

const INVOICE_EXPIRY_SECONDS = 600

// `Response.json` is missing from React Native's `Response`, where the demo
// runs too.
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

/**
 * A wallet behind one Lightning address, for the demo and e2e
 * (lightning-address/0001): it serves LUD-16 metadata, issues an invoice per
 * LUD-06 callback whose payment hash is the SHA-256 of a fresh preimage, and
 * answers LUD-21 verify for it. Nothing is paid unless `pay` is called.
 */
export const createFakeLightningAddressWallet = ({
  address,
  now,
}: {
  readonly address: string
  readonly now: () => number
}): FakeLightningAddressWallet => {
  const [name, domain] = address.split("@")
  const origin = `https://${domain}`
  const invoices = new Map<string, FakeInvoice>()
  const options = { verify: true, revealsPreimage: true }

  const issue = (amountMsat: number): { id: string; invoice: FakeInvoice } => {
    const preimage = hex.encode(crypto.getRandomValues(new Uint8Array(32)))
    const sats = amountMsat / MSATS_PER_SAT
    const invoice: FakeInvoice = {
      // `lnbc<sats×10>n`: the amount in nano-bitcoin, exactly `sats`.
      pr: createTestInvoice({
        hrp: `lnbc${sats * 10}n`,
        timestamp: Math.floor(now() / 1000),
        expirySeconds: INVOICE_EXPIRY_SECONDS,
        paymentHash: hex.encode(sha256(hex.decode(preimage))),
      }),
      preimage,
      paid: false,
    }
    const id = crypto.randomUUID()
    invoices.set(id, invoice)
    return { id, invoice }
  }

  return {
    options,
    pay: (pr) => {
      const lower = pr.toLowerCase()
      for (const invoice of invoices.values()) {
        if (invoice.pr !== lower) continue
        invoice.paid = true
        return true
      }
      return false
    },
    fetch: async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.origin !== origin) return null

      if (url.pathname === `/.well-known/lnurlp/${name}`) {
        return jsonResponse({
          tag: "payRequest",
          callback: `${origin}/lnurlp/${name}/callback`,
          minSendable: MSATS_PER_SAT,
          maxSendable: 100_000_000 * MSATS_PER_SAT,
          metadata: JSON.stringify([["text/plain", address]]),
          commentAllowed: 64,
        })
      }

      if (url.pathname === `/lnurlp/${name}/callback`) {
        const amountMsat = Number(url.searchParams.get("amount"))
        if (!Number.isInteger(amountMsat / MSATS_PER_SAT)) {
          return jsonResponse({ status: "ERROR", reason: "Whole sats only." })
        }
        const { id, invoice } = issue(amountMsat)
        return jsonResponse({
          pr: invoice.pr,
          routes: [],
          ...(options.verify
            ? { verify: `${origin}/lnurlp/${name}/verify/${id}` }
            : {}),
        })
      }

      const verifyPrefix = `/lnurlp/${name}/verify/`
      const invoice = url.pathname.startsWith(verifyPrefix)
        ? invoices.get(url.pathname.slice(verifyPrefix.length))
        : undefined
      if (invoice !== undefined) {
        return jsonResponse({
          status: "OK",
          settled: invoice.paid,
          preimage:
            invoice.paid && options.revealsPreimage ? invoice.preimage : null,
          pr: invoice.pr,
        })
      }

      return jsonResponse({ status: "ERROR", reason: "Not found." }, 404)
    },
  }
}
