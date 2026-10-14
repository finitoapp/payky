import { createConsole, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { CashuBackgroundJobContext } from "@/core/background-jobs/background-job-types.ts"
import { startCashuAccountSyncJob } from "@/core/background-jobs/jobs/cashu-account-sync-job.ts"
import { writeCashuDefaultMint } from "@/core/cashu/cashu-mints.ts"
import { createEetApiDep } from "@/core/integrations/eet/eet-client.ts"
import { createYadioApiDep } from "@/core/integrations/yadio/yadio-client.ts"
import { saveCashuAccount } from "@/core/modules/account/account-actions.ts"
import type { DeviceId } from "@/core/modules/device/device-types.ts"
import { createPayment } from "@/core/modules/payment/payment-actions.ts"
import { prepareCashuPaymentMethod } from "@/core/modules/payment/payment-preparation-actions.ts"
import { paymentClaimsQuery } from "@/core/modules/payment/payment-queries.ts"
import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"
import {
  createCashuTest,
  testCashuMasterKey,
  testMintUrl,
} from "@/test/cashu.ts"

describe("cashu account sync job", () => {
  test("settles a paid Cashu payment: claims the quote, books the topup, claims the payment", async () => {
    await using t = await createCashuTest()
    const dateDep = { date: { now: () => new Date() } }
    const fetchDep = {
      fetch: async () =>
        new Response(
          JSON.stringify({ BTC: 1_500_000, timestamp: 1_700_000_000_000 })
        ),
    }
    const errors: unknown[] = []
    const deps: CashuBackgroundJobContext &
      ReturnType<typeof createYadioApiDep> = {
      ...t.deps,
      ...dateDep,
      ...fetchDep,
      ...createYadioApiDep(),
      ...createEetApiDep({ ...dateDep, ...fetchDep }),
      masterKey: testCashuMasterKey,
      console: createConsole({ level: "silent" }),
      deviceId: "device" as DeviceId,
      connectivity: { onOnline: () => () => {} },
      onError: (error) => {
        errors.push(error)
      },
    }
    await using run = testCreateRun(deps)
    const accountId = await run.ok(saveCashuAccount({ enabled: true }))
    if (accountId === null) throw new Error("no Cashu account")
    await writeCashuDefaultMint(deps.cashuShardStore, testMintUrl)
    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(12_900),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
      })
    )
    await run.orThrow(prepareCashuPaymentMethod({ paymentId, accountId }))
    const job = await run.ok(startCashuAccountSyncJob)

    const [quoteId] = t.mint.mintQuoteIds()
    t.mint.payMintQuote(quoteId ?? "")

    await expect
      .poll(() => deps.evolu.loadQuery(paymentClaimsQuery(paymentId)), {
        timeout: 15_000,
        interval: 200,
      })
      .toHaveLength(1)
    expect(t.mint.mintQuoteState(quoteId ?? "")).toBe("ISSUED")
    await job[Symbol.asyncDispose]()
    expect(errors).toEqual([])
  }, 30_000)
})
