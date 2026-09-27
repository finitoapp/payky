import {
  createCryptoKeySigner,
  createEetClient,
  EetEndpoint,
} from "@finitoapp/eet-client"
import { parseEetReceiptData } from "@finitoapp/eet-client/builtin"
import { describe, expect, test } from "vitest"

import { createEetResponseVerifier } from "@/core/integrations/eet/eet-response-verifier.ts"
import { createFakeEetResponder } from "@/test/eet-fake-responder.ts"
import { createTestCertificate } from "@/test/eet-test-certificates.ts"

const receipt = parseEetReceiptData({
  eic_popl: "CZ1234567890",
  id_jednotky: "24",
  id_pokl: "fake-register",
  porad_cis: "fake-sale-1",
  dat_trzby: "2026-06-05T14:00:00+02:00",
  celk_trzba: "250.00",
})

describe("createFakeEetResponder", () => {
  test("answers a real SDK request with a confirmation the verifier accepts", async () => {
    if (!receipt.ok) throw new Error("Invalid test receipt.")
    const responder = await createFakeEetResponder()
    const cashRegister = await createTestCertificate({
      subject: { commonName: "CZ1234567890" },
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validTo: new Date("2027-01-01T00:00:00.000Z"),
    })
    const client = createEetClient({
      endpoint: EetEndpoint.playground,
      signer: createCryptoKeySigner(
        cashRegister.certificateDer,
        cashRegister.privateKey
      ),
      responseSignatureVerifier: createEetResponseVerifier({
        date: { now: () => new Date() },
      }),
      fetch: responder.fetch,
    })
    responder.answerNext({
      type: "confirm",
      warnings: [{ code: 4, message: "dat_trzby is in the future" }],
    })

    const result = await client.submit(receipt.value, { firstSubmission: true })

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: "accepted",
        pok: expect.stringMatching(/-ff$/u),
        test: true,
        warnings: [{ code: 4, message: "dat_trzby is in the future" }],
      },
    })
    expect(responder.requests).toMatchObject([
      {
        url: new URL(EetEndpoint.playground).href,
        header: { prvni_zaslani: "true" },
        data: {
          eic_popl: "CZ1234567890",
          id_jednotky: "24",
          id_pokl: "fake-register",
          porad_cis: "fake-sale-1",
          dat_trzby: "2026-06-05T14:00:00+02:00",
          celk_trzba: "250.00",
        },
      },
    ])
  })
})
