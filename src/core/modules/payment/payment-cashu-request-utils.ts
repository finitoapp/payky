import { PaymentRequest, PaymentRequestTransportType } from "@cashu/cashu-ts"
import { nprofileEncode } from "nostr-tools/nip19"
import { z } from "zod"

/**
 * The NUT-18 request a cashu wallet pays by sending the ecash straight to the
 * terminal's Nostr inbox over NIP-17 — the same request Linky's receive
 * screen shows, so a wallet that pays one pays the other: one mint, the
 * amount in sats, single use, and the mint quote's id so the settled ecash
 * can be matched back to this payment.
 */
export const buildCashuPaymentRequest = ({
  amountSats,
  mintUrl,
  quoteId,
  recipient,
}: {
  readonly amountSats: number
  readonly mintUrl: string
  readonly quoteId: string
  readonly recipient: {
    /** Hex public key of the Nostr identity the ecash is delivered to. */
    readonly pubkey: string
    /** Relays the paying wallet delivers the NIP-17 message to. */
    readonly relays: ReadonlyArray<string>
  }
}): string =>
  new PaymentRequest(
    [
      {
        type: PaymentRequestTransportType.NOSTR,
        target: nprofileEncode({
          pubkey: recipient.pubkey,
          relays: [...recipient.relays],
        }),
        tags: [["n", "17"]],
      },
    ],
    quoteId,
    amountSats,
    "sat",
    [mintUrl],
    undefined,
    true
  ).toEncodedCreqA()

const CashuPaymentRequestPayloadSchema = z.object({
  id: z.string().min(1).optional(),
  memo: z.string().optional(),
  mint: z.string().min(1),
  unit: z.string().min(1),
  proofs: z
    .array(
      z.object({
        id: z.string().min(1),
        amount: z.number().int().positive(),
        secret: z.string().min(1),
        C: z.string().min(1),
      })
    )
    .min(1),
})

/** What a wallet sends over the request's transport: the proofs, and the request id they answer. */
export type CashuPaymentRequestPayload = z.output<
  typeof CashuPaymentRequestPayloadSchema
>

/**
 * The NUT-18 `PaymentRequestPayload` a message carries, or `null` for any
 * other content — a chat line, or a bare token, which Linky sends instead.
 */
export const parseCashuPaymentRequestPayload = (
  content: string
): CashuPaymentRequestPayload | null => {
  const trimmed = content.trim()
  if (!trimmed.startsWith("{")) return null
  let json: unknown
  try {
    json = JSON.parse(trimmed)
  } catch {
    return null
  }
  const parsed = CashuPaymentRequestPayloadSchema.safeParse(json)
  return parsed.success ? parsed.data : null
}
