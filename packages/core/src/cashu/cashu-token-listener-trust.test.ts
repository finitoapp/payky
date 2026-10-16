import { testCreateRun } from "@evolu/common"
import { PrivateDirectMessage } from "nostr-tools/kinds"
import { createRumor, createSeal, createWrap } from "nostr-tools/nip59"
import { generateSecretKey, getPublicKey } from "nostr-tools/pure"
import { expect, test } from "vitest"
import { createQuery } from "../evolu/schema.ts"
import { createYadioApiDep } from "../integrations/yadio/yadio-client.ts"
import { saveCashuAccount } from "../modules/account/account-actions.ts"
import { createPayment } from "../modules/payment/payment-actions.ts"
import { prepareCashuPaymentMethod } from "../modules/payment/payment-preparation-actions.ts"
import { deriveNostrSecretKey } from "../modules/shared/key-derivation.ts"
import { NonNegativeInteger } from "../modules/shared/schema.ts"
import {
  createCashuTest,
  testCashuMasterKey,
  testMintUrl,
} from "../testing/cashu.ts"
import { createFakeNostrDep } from "../testing/nostr.ts"
import { writeCashuDefaultMint } from "./cashu-mints.ts"
import {
  cashuTokenArrivals,
  createCashuTokenListener,
} from "./cashu-token-listener.ts"

const receiveIdsQuery = createQuery((db) =>
  db.selectFrom("paymentCashu").select(["id", "receiveOperationId"])
)

test("a token from a mint other than the default is not received and pays nothing (cashu/0011)", async () => {
  await using t = await createCashuTest()
  const fakeNostr = createFakeNostrDep()
  const deps = {
    ...t.deps,
    fetch: async () =>
      new Response(
        JSON.stringify({ BTC: 1_500_000, timestamp: 1_700_000_000_000 })
      ),
    ...createYadioApiDep(),
    masterKey: testCashuMasterKey,
    date: { now: () => new Date() },
    nostr: fakeNostr.nostr,
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

  const payky = getPublicKey(deriveNostrSecretKey(testCashuMasterKey))
  const customer = generateSecretKey()
  const payload = JSON.stringify({
    id: paymentId,
    mint: "https://rogue.mint",
    unit: "sat",
    proofs: [{ id: "00ad268c4d1f5826", amount: 8, secret: "s", C: "02aa" }],
  })
  fakeNostr.deliver(
    createWrap(
      createSeal(
        createRumor(
          {
            kind: PrivateDirectMessage,
            created_at: Math.floor(Date.now() / 1000),
            content: payload,
            tags: [["p", payky]],
          },
          customer
        ),
        customer,
        payky
      ),
      payky
    )
  )

  const listener = createCashuTokenListener(run)
  await listener.start(() => undefined)
  await listener.tick()
  listener.stop()

  expect(cashuTokenArrivals.get(paymentId)?.state).toBe("untrustedMint")
  expect(
    (await deps.cashuShardStore.loadOperations()).filter(
      (operation) => operation.kind === "receive"
    )
  ).toEqual([])
  expect(
    (await deps.evolu.loadQuery(receiveIdsQuery)).find(
      (row) => row.id === paymentId
    )?.receiveOperationId
  ).toBeNull()
})
