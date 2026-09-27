import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"

import { formatEetDateTime } from "@/core/modules/eet/eet-utils.ts"
import { readEetCertificateFile } from "./eet-certificate.ts"
import { createEetApiDep } from "./eet-client.ts"

const certificatePath = process.env.EET_TEST_P12_PATH ?? ""
const certificatePassword = process.env.EET_TEST_P12_PASSWORD ?? ""

describe.runIf(process.env.EET_TEST_LIVE_PLAYGROUND === "1")(
  "EET playground, live",
  () => {
    test("confirms a sale with a test POK", async () => {
      const now = new Date()
      const certificate = await readEetCertificateFile({
        file: new Uint8Array(readFileSync(certificatePath)),
        password: certificatePassword,
        now,
      })
      if (!certificate.ok) throw new Error(certificate.error.type)
      const { eetApi } = createEetApiDep(
        { fetch: globalThis.fetch.bind(globalThis), date: { now: () => now } },
        { productionUrl: undefined }
      )

      const submission = await eetApi.submit({
        environment: "playground",
        certificate: certificate.value,
        receipt: {
          eic: certificate.value.eic,
          establishmentId: "1",
          cashRegisterId: "payky-live-test",
          sequenceNumber: `live-${now.getTime()}`,
          saleAt: formatEetDateTime(now),
          totalAmount: "1.00",
        },
        firstSubmission: true,
        verification: false,
      })

      expect(submission.outcome).toMatchObject({
        type: "accepted",
        isTest: true,
        pok: expect.stringMatching(/-ff$/u),
      })
    }, 30_000)
  }
)
