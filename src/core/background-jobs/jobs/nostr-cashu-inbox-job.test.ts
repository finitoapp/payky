import { testCreateConsole, testCreateRun } from "@evolu/common"
import { wrapEvent } from "nostr-tools/nip59"
import { type Event, generateSecretKey, getPublicKey } from "nostr-tools/pure"
import { describe, expect, test } from "vitest"

import type {
  CashuReceiveOutcome,
  CashuWallet,
} from "@/core/cashu/cashu-wallet.ts"
import { FakeCashuWallet } from "@/core/cashu/cashu-wallet-test-fixtures.ts"
import { createInProcessLockManager } from "@/core/cli/in-process-lock-manager.ts"
import type { FetchDep } from "@/core/deps.ts"
import { createEvoluTest } from "@/core/evolu/cli-client.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import {
  CHAT_RUMOR_KIND,
  type SubscribeGiftWraps,
} from "@/core/linky/nostr-inbox.ts"
import type { NostrInboxSource } from "@/core/linky/nostr-inbox-source.ts"
import { createAccount } from "@/core/modules/account/account-actions.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { createPayment } from "@/core/modules/payment/payment-actions.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import {
  CashuMintUrl,
  NonEmptyString255,
  NonEmptyStringSchema,
  NonNegativeInteger,
  PositiveNumberSchema,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import { createTestDateDep } from "@/test/date-dep.ts"
import { createNostrCashuInboxJob } from "./nostr-cashu-inbox-job.ts"

const unimplementedFetch: FetchDep["fetch"] = (() => {
  throw new Error("fetch is not implemented in this test.")
}) as unknown as FetchDep["fetch"]

const mintUrl = CashuMintUrl("https://mint.example")

type TestEvolu = Awaited<ReturnType<typeof createEvoluTest>>["evolu"]

const cashuTransactionsQuery = createQuery((db) =>
  db
    .selectFrom("accountTransaction")
    .innerJoin(
      "accountTransactionCashu",
      "accountTransactionCashu.id",
      "accountTransaction.id"
    )
    .select([
      "accountTransaction.accountId",
      "accountTransaction.amount",
      "accountTransactionCashu.quoteId",
      "accountTransactionCashu.receiveOperationId",
    ])
    .where("accountTransaction.isDeleted", "is not", 1)
    .orderBy("accountTransactionCashu.quoteId")
)

const claimsByPaymentIdQuery = (paymentId: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("reconciliationClaim")
      .select(["paymentId", "source"])
      .where("paymentId", "=", paymentId)
      .where("isDeleted", "is not", 1)
  )

/** A terminal's inbox, with the wraps a test hands it. */
const createInbox = () => {
  const secretKey = generateSecretKey()
  const pubkey = getPublicKey(secretKey)
  let deliver: ((wrap: Event) => void) | null = null
  const subscriptions: Array<{ readonly since: number; closed: boolean }> = []

  const source: NostrInboxSource = {
    current: async () => ({ pubkey, secretKey, relays: ["wss://relay.test"] }),
    subscribe: () => () => undefined,
  }
  const subscribeGiftWraps: SubscribeGiftWraps = async ({ since, onWrap }) => {
    const entry = { since, closed: false }
    subscriptions.push(entry)
    deliver = onWrap
    return {
      close: () => {
        entry.closed = true
      },
    }
  }
  /** A NIP-17 message from a fresh customer key, gift-wrapped to the terminal. */
  const sendMessage = (content: string): Event => {
    const wrap = wrapEvent(
      { kind: CHAT_RUMOR_KIND, content, tags: [["p", pubkey]] },
      generateSecretKey(),
      pubkey
    )
    if (deliver === null) throw new Error("The job is not subscribed yet.")
    deliver(wrap)
    return wrap
  }

  return {
    source,
    subscribeGiftWraps,
    subscriptions,
    sendMessage,
    isSubscribed: () => deliver !== null,
  }
}

const describeToken: CashuWallet["describeToken"] = async (text) => {
  const match = /^cashuB-(\d+)-(.+)$/.exec(text.trim())
  if (match === null) return null
  return {
    tokenText: text.trim(),
    mintUrl,
    amountSats: Number(match[1]),
  }
}

const createPreparedCashuPayment = async ({
  evolu,
  accountId,
  amountSats,
  quoteId,
}: {
  readonly evolu: TestEvolu
  readonly accountId: AccountId
  readonly amountSats: number
  readonly quoteId: string
}): Promise<PaymentId> => {
  await using run = testCreateRun({
    evolu,
    evoluOwnerId: evolu.appOwner.id,
    ...createTestDateDep(),
  })
  return await run.orThrow(
    createPayment({
      deviceId: null,
      billId: null,
      tableId: null,
      amount: NonNegativeInteger(12_900),
      currency: "CZK",
      tipAmount: NonNegativeInteger(0),
      canceledAt: null,
      expiresAt: null,
      cashu: {
        accountId,
        amountSats: NonNegativeInteger(amountSats),
        exchangeRate: PositiveNumberSchema.decode(1_500_000),
        exchangeRateSource: "yadio",
        exchangeRateFetchedAt: TimestampMsSchema.decode(1_700_000_000_000),
        mintUrl,
        quoteId: NonEmptyStringSchema.decode(quoteId),
        lnInvoice: NonEmptyStringSchema.decode(`lnbc-${quoteId}`),
      },
    })
  )
}

const startJob = async ({
  evolu,
  wallet,
  inbox,
}: {
  readonly evolu: TestEvolu
  readonly wallet: FakeCashuWallet
  readonly inbox: ReturnType<typeof createInbox>
}) => {
  const errors: unknown[] = []
  const jobRun = testCreateRun({
    console: testCreateConsole(),
    evolu,
    evoluOwnerId: evolu.appOwner.id,
    ...createTestDateDep(),
    fetch: unimplementedFetch,
    lockManager: createInProcessLockManager(),
    cashuWallet: wallet,
    nostrInbox: inbox.source,
    onError: (error: unknown) => {
      errors.push(error)
    },
  })
  const job = await jobRun.ok(
    createNostrCashuInboxJob({
      subscribeGiftWraps: inbox.subscribeGiftWraps,
      settledRecheckDelaysMs: [5, 5],
    })
  )
  await expect.poll(() => inbox.isSubscribed()).toBe(true)
  return { jobRun, job, errors }
}

describe("nostr cashu inbox job", () => {
  test("receives a bare token and claims the unclaimed payment quoted at its amount", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createTestDateDep(),
    })
    const accountId = await run.ok(
      createAccount({
        deviceId: null,
        name: NonEmptyString255("Cashu wallet"),
        cashu: { mintUrl },
      })
    )
    const paymentId = await createPreparedCashuPayment({
      evolu,
      accountId,
      amountSats: 860,
      quoteId: "quote-1",
    })

    const inbox = createInbox()
    const wallet = new FakeCashuWallet({
      describeToken,
      receiveToken: async (text): Promise<CashuReceiveOutcome> => ({
        kind: "received",
        operationId: `receive-${text}`,
        mintUrl,
        amountSats: 859,
      }),
    })
    const { jobRun, job, errors } = await startJob({ evolu, wallet, inbox })
    await using _jobRun = jobRun
    await using _job = job

    inbox.sendMessage("thanks for the coffee")
    inbox.sendMessage("cashuB-860-abc")

    await expect
      .poll(() => evolu.loadQuery(cashuTransactionsQuery))
      .toEqual([
        {
          accountId,
          amount: 860,
          quoteId: "quote-1",
          receiveOperationId: "receive-cashuB-860-abc",
        },
      ])
    await expect
      .poll(() => evolu.loadQuery(claimsByPaymentIdQuery(paymentId)))
      .toEqual([{ paymentId, source: "auto" }])
    expect(wallet.receivedTexts).toEqual(["cashuB-860-abc"])
    expect(errors).toEqual([])
  })

  test("matches a NUT-18 payload by its request id and ignores an amount it does not pay", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createTestDateDep(),
    })
    const accountId = await run.ok(
      createAccount({
        deviceId: null,
        name: NonEmptyString255("Cashu wallet"),
        cashu: { mintUrl },
      })
    )
    const olderPaymentId = await createPreparedCashuPayment({
      evolu,
      accountId,
      amountSats: 500,
      quoteId: "quote-older",
    })
    const paymentId = await createPreparedCashuPayment({
      evolu,
      accountId,
      amountSats: 500,
      quoteId: "quote-newer",
    })

    const inbox = createInbox()
    const wallet = new FakeCashuWallet({
      describeToken,
      encodeToken: async ({ proofs }) =>
        `cashuB-${proofs.reduce((sum, proof) => sum + proof.amount, 0)}-payload`,
      receiveToken: async (text): Promise<CashuReceiveOutcome> => ({
        kind: "received",
        operationId: `receive-${text}`,
        mintUrl,
        amountSats: 500,
      }),
    })
    const { jobRun, job, errors } = await startJob({ evolu, wallet, inbox })
    await using _jobRun = jobRun
    await using _job = job

    const proof = { id: "00ad268c4d1f5826", secret: "s", C: "02ab" }
    inbox.sendMessage(
      JSON.stringify({
        id: "quote-older",
        mint: mintUrl,
        unit: "sat",
        proofs: [{ ...proof, amount: 400 }],
      })
    )
    inbox.sendMessage(
      JSON.stringify({
        id: "quote-older",
        mint: mintUrl,
        unit: "sat",
        proofs: [{ ...proof, amount: 500 }],
      })
    )

    await expect
      .poll(() => evolu.loadQuery(claimsByPaymentIdQuery(olderPaymentId)))
      .toEqual([{ paymentId: olderPaymentId, source: "auto" }])
    expect(await evolu.loadQuery(claimsByPaymentIdQuery(paymentId))).toEqual([])
    expect(wallet.receivedTexts).toEqual(["cashuB-500-payload"])
    expect(errors).toEqual([])
  })

  test("settles from the wallet's own receive when another app got the token first, once only", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createTestDateDep(),
    })
    const accountId = await run.ok(
      createAccount({
        deviceId: null,
        name: NonEmptyString255("Cashu wallet"),
        cashu: { mintUrl },
      })
    )
    const paymentId = await createPreparedCashuPayment({
      evolu,
      accountId,
      amountSats: 210,
      quoteId: "quote-1",
    })
    const inbox = createInbox()
    // The mint says spent, and Linky's receive record is not there on the
    // first look; it has synced by the time the job looks again.
    let recordLookups = 0
    const wallet = new FakeCashuWallet({
      describeToken,
      receiveToken: async (): Promise<CashuReceiveOutcome> =>
        recordLookups === 0
          ? { kind: "alreadySpent" }
          : { kind: "alreadyKnown", operationId: "linky-receive" },
      findReceivedTransfer: async () => {
        recordLookups += 1
        return recordLookups >= 2
          ? { operationId: "linky-receive", mintUrl, amountSats: 210 }
          : null
      },
    })
    const { jobRun, job, errors } = await startJob({ evolu, wallet, inbox })
    await using _jobRun = jobRun
    await using _job = job

    inbox.sendMessage("cashuB-210-abc")

    await expect
      .poll(() => evolu.loadQuery(claimsByPaymentIdQuery(paymentId)))
      .toEqual([{ paymentId, source: "auto" }])
    expect(await evolu.loadQuery(cashuTransactionsQuery)).toEqual([
      {
        accountId,
        amount: 210,
        quoteId: "quote-1",
        receiveOperationId: "linky-receive",
      },
    ])

    // The same token again cannot settle the next payment of that amount.
    const replayedPaymentId = await createPreparedCashuPayment({
      evolu,
      accountId,
      amountSats: 210,
      quoteId: "quote-2",
    })
    inbox.sendMessage("cashuB-210-abc ")
    await expect.poll(() => wallet.receivedTexts.length).toBe(2)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(
      await evolu.loadQuery(claimsByPaymentIdQuery(replayedPaymentId))
    ).toEqual([])
    expect(errors).toEqual([])
  })
})
