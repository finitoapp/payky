import {
  type CreateWebSocket,
  type KyselyNotNull,
  type MutationOptions,
  type Query,
  type Row,
  sqliteTrue,
  testCreateLockManager,
  testCreateRun,
} from "@evolu/common"
import { z } from "zod"
import { createCashuWalletDep } from "../cashu/cashu-wallet.ts"
import {
  createFakeCashuMint,
  createFakeMintsFetch,
  createFakeMintsWebSocket,
  type FakeCashuMint,
  type FakeCashuMintOptions,
} from "../cashu/fake-cashu-mint.ts"
import type { AppOwnerSyncState } from "../deps.ts"
import { createQuery, type Evolu, type EvoluSchema } from "../evolu/schema.ts"
import { CASHU_OUTPUT_BLOCK } from "../modules/cashu/cashu-counter-actions.ts"
import { cashuBalancesQuery } from "../modules/cashu/cashu-queries.ts"
import {
  claimCashuTopup,
  createCashuTopupQuote,
} from "../modules/cashu/cashu-topup-actions.ts"
import {
  CashuAmount,
  type CashuAttemptRole,
  type CashuOperationAttemptId,
  type CashuOperationId,
  type CashuProofState,
  CashuTokenText,
  KeysetId,
  MintUrl,
} from "../modules/cashu/cashu-types.ts"
import {
  CashuTrustedMintsJson,
  cashuMintTrustId,
  cashuProofIdFor,
} from "../modules/cashu/cashu-utils.ts"
import {
  createRowId,
  runMutationWithCompletion,
} from "../modules/shared/evolu-utils.ts"
import {
  CashuWalletSeed,
  deriveCashuWalletSeed,
  MasterKey,
} from "../modules/shared/key-derivation.ts"
import { NonNegativeInteger } from "../modules/shared/schema.ts"
import { createEvoluTest } from "./evolu.ts"

export const testCashuMasterKey = MasterKey("000102030405060708090a0b0c0d0e0f")
export const testMintUrl = MintUrl("https://mint.test")

/**
 * Payky's Cashu wallet for a test: an app Evolu, fake mints behind `fetch`,
 * and the deps every Cashu Task takes. `extraMints` adds more fake mints;
 * `otherDevice` opens a second device of the same account (its own app
 * database, wallet cache and counters) over the same mints. The two share
 * nothing until a test syncs them through a relay.
 */
export const createCashuTest = async ({
  mint: mintOptions = {},
  extraMints = [],
  now,
  fetch: realFetch,
  createWebSocket,
  defaultMint = testMintUrl,
}: {
  /**
   * The mint each device's database starts with as its trusted default
   * (cashu/0013); null starts with none, as a new account does.
   */
  readonly defaultMint?: MintUrl | null
  /** A real socket factory, for a test that syncs through a relay. */
  readonly createWebSocket?: CreateWebSocket
  readonly mint?: Partial<FakeCashuMintOptions>
  readonly extraMints?: ReadonlyArray<FakeCashuMintOptions>
  readonly now?: () => number
  /** A real `fetch` instead of the fake mints, for the live test. */
  readonly fetch?: typeof globalThis.fetch
} = {}) => {
  await using disposer = new AsyncDisposableStack()
  const socketOptions = createWebSocket === undefined ? {} : { createWebSocket }
  const { evolu } = disposer.use(await createEvoluTest(socketOptions))
  // A melt at any fake mint pays the invoice wherever it was issued.
  const payInvoice = (invoice: string) => {
    for (const fake of [mint, ...others]) fake.payInvoice(invoice)
  }
  const mint = createFakeCashuMint({
    url: testMintUrl,
    onInvoicePaid: payInvoice,
    ...(now === undefined ? {} : { now }),
    ...mintOptions,
  })
  const others = extraMints.map((options) =>
    createFakeCashuMint({ onInvoicePaid: payInvoice, ...options })
  )
  const fetch = realFetch ?? createFakeMintsFetch([mint, ...others])
  // The fake mints' NUT-17 socket; cashu-ts takes a `WebSocket` class, which
  // the fake implements only as far as cashu-ts uses it.
  const webSocketOption =
    realFetch === undefined
      ? {
          webSocket: createFakeMintsWebSocket([
            mint,
            ...others,
          ]) as unknown as typeof WebSocket,
        }
      : {}
  const seed = deriveCashuWalletSeed(testCashuMasterKey)
  const date =
    now === undefined
      ? { date: { now: () => new Date() } }
      : { date: { now: () => new Date(now()) } }
  const deps = {
    evolu,
    evoluOwner: evolu.appOwner,
    masterKey: testCashuMasterKey,
    // A test's device has synced unless the test says otherwise (cashu/0013).
    appOwnerSync: { state: (): AppOwnerSyncState => ({ type: "complete" }) },
    lockManager: testCreateLockManager(),
    fetch,
    ...date,
    ...createCashuWalletDep({ seed, fetch, ...webSocketOption }),
  }
  await seedTestDefaultMint(evolu, defaultMint)
  // Devices opened during the test, disposed before the rest.
  const devices = new AsyncDisposableStack()
  /** Another Payky device of the same account: its own app database. */
  const otherDevice = async () => {
    const other = devices.use(await createEvoluTest(socketOptions))
    await seedTestDefaultMint(other.evolu, defaultMint)
    return {
      ...deps,
      evolu: other.evolu,
      evoluOwner: other.evolu.appOwner,
      lockManager: testCreateLockManager(),
      ...createCashuWalletDep({ seed, fetch, ...webSocketOption }),
    }
  }
  const disposables = disposer.move()
  return {
    deps,
    mint,
    others,
    otherDevice,
    [Symbol.asyncDispose]: async () => {
      await devices.disposeAsync()
      await disposables.disposeAsync()
    },
  }
}

/** The trusted mints a test's devices start with: `mint` alone, as a list the merchant wrote. */
const seedTestDefaultMint = (
  evolu: Evolu,
  mint: MintUrl | null
): Promise<unknown> =>
  mint === null
    ? Promise.resolve()
    : runMutationWithCompletion((options) =>
        evolu.upsert(
          "cashuMintTrust",
          {
            id: cashuMintTrustId,
            trustedMintsJson: z.encode(CashuTrustedMintsJson, [mint]),
          },
          options
        )
      )

/**
 * Puts proofs straight into a database, as a test's starting balance: each
 * `available`, or `spent` when given.
 */
export const storeTestCashuProofs = (
  evolu: Evolu,
  proofs: ReadonlyArray<{
    readonly mintUrl: MintUrl
    readonly keysetId: string
    readonly amount: number
    readonly secret: string
    readonly state?: "available" | "spent"
  }>
): Promise<void> =>
  runMutationWithCompletion((options) => {
    for (const proof of proofs)
      evolu.upsert(
        "cashuProof",
        {
          id: cashuProofIdFor(proof.secret),
          mintUrl: proof.mintUrl,
          keysetId: KeysetId(proof.keysetId),
          amount: CashuAmount(proof.amount),
          secret: proof.secret,
          c: "02aa",
          dleq: null,
          ...(proof.state === "spent" ? { isSpent: sqliteTrue } : {}),
        },
        options
      )
  })

const allProofsQuery = createQuery((db) =>
  db
    .selectFrom("cashuProof")
    .select(["id", "mintUrl", "amount", "secret", "isSpent", "operationId"])
    .where("isDeleted", "is not", 1)
    .orderBy("createdAt")
)

/** Every proof in a database with its state read from its cells, for assertions. */
export const loadTestCashuProofs = async (evolu: Evolu) =>
  (await evolu.loadQuery(allProofsQuery)).map((proof) => ({
    ...proof,
    state: (proof.isSpent === sqliteTrue
      ? "spent"
      : proof.operationId !== null
        ? "held"
        : "available") satisfies CashuProofState as CashuProofState,
  }))

/** The available Cashu balance of a database, for assertions. */
export const testCashuBalance = async (evolu: Evolu): Promise<number> =>
  (await loadTestCashuProofs(evolu))
    .filter((proof) => proof.state === "available")
    .reduce((sum, proof) => sum + (proof.amount ?? 0), 0)

/**
 * A customer's own wallet at `t.mint`, the test's main mint unless another
 * of its fake mints is passed: another seed. `token`
 * mints `amount` and encodes it, P2PK-locked to `lockTo` when given.
 */
export const createTestCashuCustomer = (t: {
  readonly deps: { readonly fetch: typeof globalThis.fetch }
  readonly mint: FakeCashuMint
}) => {
  const customer = createCashuWalletDep({
    seed: CashuWalletSeed(new Uint8Array(64).fill(9)),
    fetch: t.deps.fetch,
  })
  return {
    token: async (amount: number, lockTo?: string) => {
      const mintUrl = MintUrl(t.mint.url)
      const wallet = await customer.cashuWallet.load(mintUrl)
      const quote = await wallet.createMintQuoteBolt11(amount)
      t.mint.payMintQuote(quote.quote)
      const proofs = await wallet.mintProofsBolt11(amount, quote.quote)
      const sendable =
        lockTo === undefined
          ? proofs
          : (
              await wallet.send(amount, proofs, undefined, {
                send: { type: "p2pk", options: { pubkey: lockTo } },
              })
            ).send
      const { getEncodedToken } = await import("@cashu/cashu-ts")
      return {
        wallet,
        proofs: sendable,
        text: CashuTokenText(
          getEncodedToken({ mint: mintUrl, proofs: sendable, unit: "sat" })
        ),
      }
    },
  }
}

/** Tops the wallet up with `amount` at `mint` through a real claim. */
export const fundTestCashuWallet = async (
  t: Awaited<ReturnType<typeof createCashuTest>>,
  amount: number,
  mint: MintUrl = testMintUrl
): Promise<void> => {
  await using run = testCreateRun(t.deps)
  const quote = await run.orThrow(
    createCashuTopupQuote({
      mint,
      amount: CashuAmount(amount),
      purpose: "move",
    })
  )
  for (const fake of [t.mint, ...t.others]) fake.payInvoice(quote.invoice)
  await run.orThrow(claimCashuTopup(quote.operationId))
}

const operationsQuery = createQuery((db) =>
  db
    .selectFrom("cashuOperation")
    .select(["id", "kind", "status", "mintUrl", "amount"])
    .where("isDeleted", "is not", 1)
    .orderBy("createdAt")
)

/** Every Cashu operation in a database, for assertions. */
export const loadTestCashuOperations = (evolu: Evolu) =>
  evolu.loadQuery(operationsQuery)

/** The available balance per mint, for assertions. */
export const testCashuBalances = async (evolu: Evolu) =>
  new Map(
    (await evolu.loadQuery(cashuBalancesQuery)).map((row) => [
      row.mintUrl,
      row.balance,
    ])
  )

/**
 * Every row `query` returns in any state the database passes through from
 * now on, Evolu notifying after each batch: for asserting that a state two
 * writes would leave between them is never seen.
 */
export const watchTestQuery = async <R extends Row>(
  evolu: Evolu,
  query: Query<EvoluSchema, R>
) => {
  const seen: Array<R> = []
  await evolu.loadQuery(query)
  const unsubscribe = evolu.subscribeQuery(query)(() => {
    seen.push(...evolu.getQueryRows(query))
  })
  return { seen, [Symbol.dispose]: unsubscribe }
}

/**
 * Another Payky device's NUT-13 attempt for an operation, as it syncs in
 * (cashu/0029): on record, but not this device's own. `slots` is how many
 * outputs its call asked for (cashu/0039), a whole `CASHU_OUTPUT_BLOCK` unless
 * given, so a test need not know the call's exact split.
 */
export const upsertTestCashuAttemptElsewhere = (
  evolu: Evolu,
  {
    operationId,
    keysetId,
    counter,
    role,
    slots = CASHU_OUTPUT_BLOCK,
  }: {
    readonly operationId: CashuOperationId
    readonly keysetId: string
    readonly counter: number
    readonly role: CashuAttemptRole
    readonly slots?: number
  },
  options?: MutationOptions
): CashuOperationAttemptId => {
  const id = createRowId<"CashuOperationAttempt">()
  evolu.upsert(
    "cashuOperationAttempt",
    {
      id,
      operationId,
      keysetId: KeysetId(keysetId),
      counter: NonNegativeInteger(counter),
      slots: NonNegativeInteger(slots),
      role,
    },
    options
  )
  return id
}

const attemptRowsQuery = createQuery((db) =>
  db
    .selectFrom("cashuOperationAttempt")
    .select([
      "id",
      "operationId",
      "keysetId",
      "counter",
      "slots",
      "role",
      "isRejected",
    ])
    .where("isDeleted", "is not", 1)
    .$narrowType<{
      operationId: KyselyNotNull
      keysetId: KyselyNotNull
      counter: KyselyNotNull
      slots: KyselyNotNull
      role: KyselyNotNull
    }>()
)

/**
 * Syncs the attempts on record from one device's database into another's,
 * cell by cell as Evolu merges them: a cell the source never wrote leaves
 * the target's as it is. `_cashuOwnAttempt` stays on each device.
 */
export const syncTestCashuAttempts = async (
  from: Evolu,
  to: Evolu
): Promise<void> => {
  const rows = await from.loadQuery(attemptRowsQuery)
  await runMutationWithCompletion((options) => {
    for (const row of rows)
      to.upsert(
        "cashuOperationAttempt",
        {
          id: row.id,
          operationId: row.operationId,
          keysetId: row.keysetId,
          counter: row.counter,
          slots: row.slots,
          role: row.role,
          ...(row.isRejected === null ? {} : { isRejected: row.isRejected }),
        },
        options
      )
  })
}
