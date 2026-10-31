import {
  createConsole,
  createOwnerWebSocketTransport,
  type DisposableRun,
  testCreateLockManager,
  testCreateRun,
} from "@evolu/common"
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex } from "@noble/hashes/utils.js"
import fc from "fast-check"
import { z } from "zod"
import type { CashuBackgroundJobContext } from "../background-jobs/background-job-types.ts"
import { createCashuAccountSync } from "../background-jobs/jobs/cashu-account-sync-job.ts"
import { createCashuWalletDep } from "../cashu/cashu-wallet.ts"
import {
  createFakeCashuMint,
  type FakeCashuMint,
  type FakeMintEndpoint,
  type FakeMintFailure,
} from "../cashu/fake-cashu-mint.ts"
import type { AppOwnerSyncState } from "../deps.ts"
import { createQuery, type Evolu } from "../evolu/schema.ts"
import { createEetApiDep } from "../integrations/eet/eet-client.ts"
import { createQerkoApiDep } from "../integrations/qerko/qerko-client.ts"
import { saveCashuAccount } from "../modules/account/account-actions.ts"
import {
  meltCashu,
  quoteCashuMelt,
} from "../modules/cashu/cashu-melt-actions.ts"
import {
  claimCashuTopup,
  createCashuTopupQuote,
} from "../modules/cashu/cashu-topup-actions.ts"
import {
  CashuAmount,
  type CashuOperationId,
} from "../modules/cashu/cashu-types.ts"
import {
  CashuTrustedMintsJson,
  cashuMintTrustId,
} from "../modules/cashu/cashu-utils.ts"
import type { DeviceId } from "../modules/device/device-types.ts"
import { runMutationWithCompletion } from "../modules/shared/evolu-utils.ts"
import { deriveCashuWalletSeed } from "../modules/shared/key-derivation.ts"
import { createTestInvoice } from "../modules/shared/lightning-invoice-test-fixtures.ts"
import {
  loadTestCashuOperations,
  loadTestCashuProofs,
  testCashuBalance,
  testCashuMasterKey,
  testMintUrl,
} from "./cashu.ts"
import { createEvoluTest } from "./evolu.ts"
import { createTestRelay } from "./evolu-relay.ts"
import { awaitSyncRound, createSwitchableWebSocket } from "./evolu-sync.ts"
import { createFakeNostrDep } from "./nostr.ts"

/**
 * A simulation of Payky's Cashu wallet: several devices of one account over
 * one fake mint, which loses, garbles, refuses and holds requests, with sync switched on and off, crashes and a
 * moving clock. A scenario is a list of actions fast-check generates and
 * shrinks; `runCashuScenario` plays it, brings it to rest, and returns a
 * trace of every step and the state it ended in, for the invariants and for
 * replaying it.
 *
 * Steps run one at a time, and every online device is synced with the relay
 * after each, so what a device sees at a step depends only on the steps
 * before it. Evolu stamps every write at the simulated clock
 * (`setMutationBackdate`), which also orders two devices' writes by the
 * step that made them rather than by the real millisecond.
 */

/** The simulated clock starts here: in the past, as backdated writes must be. */
const SIMULATION_START_MS = Date.parse("2026-01-01T00:00:00.000Z")
/** Every step takes this long on the simulated clock. */
const STEP_MS = 1_000
/** How far each round of the rest phase moves the clock: past one grace. */
const REST_ROUND_MS = 6 * 60_000
/** A scenario that changes something after this many rounds never rests. */
const MAX_REST_ROUNDS = 30
/** Rounds in a row that must change nothing before a scenario is at rest. */
const STABLE_ROUNDS = 3

export type SimFault =
  | "unreachable"
  | "lostResponse"
  | "garbledResponse"
  | "deferred"
  | { readonly code: number }

export type SimAction =
  | { readonly type: "topup"; readonly device: number; readonly amount: number }
  /** `topup` counts back from the latest topup quote. */
  | { readonly type: "customerPays"; readonly topup: number }
  | { readonly type: "claim"; readonly device: number; readonly topup: number }
  /** `percent` of the device's available balance, so most melts can pay. */
  | { readonly type: "melt"; readonly device: number; readonly percent: number }
  /**
   * Two devices, both offline, claim a paid topup each at the same counter:
   * the first one's mint call is held by the mint or its answer lost, so
   * neither knows of the other's block (cashu/0029, cashu/0031).
   */
  | {
      readonly type: "collidingClaims"
      readonly first: number
      readonly amounts: readonly [number, number]
      readonly firstCall: "deferred" | "lostResponse"
    }
  /**
   * Two devices, both offline, melt from the same proofs: the first one's
   * pre-swap or melt request is held by the mint or its answer lost, so the
   * second selects proofs the first still holds (cashu/0019, cashu/0026,
   * cashu/0027).
   */
  | {
      readonly type: "collidingMelts"
      readonly first: number
      readonly percents: readonly [number, number]
      readonly endpoint: "swap" | "melt"
      readonly firstCall: "deferred" | "lostResponse"
    }
  | { readonly type: "jobTick"; readonly device: number }
  | { readonly type: "sync"; readonly device: number; readonly online: boolean }
  | { readonly type: "crash"; readonly device: number }
  | { readonly type: "advanceClock"; readonly ms: number }
  /** The next call to `endpoint` in the step that follows fails so. */
  | {
      readonly type: "fault"
      readonly endpoint: FakeMintEndpoint
      readonly fault: SimFault
    }
  | { readonly type: "deliverDeferred"; readonly index: number }
  | { readonly type: "dropDeferred"; readonly index: number }

export interface SimScenario {
  readonly devices: number
  readonly inputFeePpk: number
  /** Sats the first device claims before the steps, synced to every device. */
  readonly funding: number
  /** What becomes of the requests the mint still holds once the steps end. */
  readonly heldAtRest: "deliver" | "drop"
  readonly actions: ReadonlyArray<SimAction>
}

const faultedEndpoints = [
  "mint",
  "swap",
  "melt",
  "checkstate",
  "restore",
  "checkMintQuote",
  "checkMeltQuote",
] as const satisfies ReadonlyArray<FakeMintEndpoint>

/**
 * The NUT-00 refusals a real mint can answer at each endpoint without doing
 * the work, so a fault never makes the mint lie and every finding is one a
 * real mint can cause: outputs another device's call signed (11003) or still
 * has pending (11004)
 * at a mint or a swap, and a melt quote the mint takes for expired (20007)
 * by a clock ahead of the device's. 11001 is left to the mint itself, which
 * answers it when the inputs are spent; 12002 waits for keyset rotation.
 */
const faultCodesOf = {
  mint: [11003, 11004],
  swap: [11003, 11004],
  melt: [11004, 20007],
  checkstate: [],
  restore: [],
  checkMintQuote: [],
  checkMeltQuote: [],
} as const satisfies Record<
  (typeof faultedEndpoints)[number],
  ReadonlyArray<number>
>

const transportFaults = [
  "unreachable",
  "lostResponse",
  "garbledResponse",
  "deferred",
] as const satisfies ReadonlyArray<SimFault>

const faultArbitrary = fc
  .constantFrom(...faultedEndpoints)
  .chain((endpoint) => {
    const codes: ReadonlyArray<number> = faultCodesOf[endpoint]
    const transport = fc.constantFrom(...transportFaults)
    return fc.record({
      type: fc.constant("fault" as const),
      endpoint: fc.constant(endpoint),
      fault:
        codes.length === 0
          ? transport
          : fc.oneof(transport, fc.record({ code: fc.constantFrom(...codes) })),
    })
  })

/** A scenario over `devices` devices (2 or 3). */
export const cashuScenarioArbitrary = ({
  minActions = 10,
  maxActions = 40,
}: {
  readonly minActions?: number
  readonly maxActions?: number
} = {}): fc.Arbitrary<SimScenario> =>
  fc.integer({ min: 2, max: 3 }).chain((devices) => {
    const device = fc.integer({ min: 0, max: devices - 1 })
    const action: fc.Arbitrary<SimAction> = fc.oneof(
      {
        weight: 3,
        arbitrary: fc.record({
          type: fc.constant("topup"),
          device,
          amount: fc.integer({ min: 1, max: 500 }),
        }),
      },
      {
        weight: 3,
        arbitrary: fc.record({
          type: fc.constant("customerPays"),
          topup: fc.nat(3),
        }),
      },
      {
        weight: 3,
        arbitrary: fc.record({
          type: fc.constant("claim"),
          device,
          topup: fc.nat(3),
        }),
      },
      {
        weight: 3,
        arbitrary: fc.record({
          type: fc.constant("melt"),
          device,
          percent: fc.integer({ min: 10, max: 110 }),
        }),
      },
      {
        weight: 1,
        arbitrary: fc.record({
          type: fc.constant("collidingClaims"),
          first: device,
          amounts: fc.tuple(
            fc.integer({ min: 1, max: 500 }),
            fc.integer({ min: 1, max: 500 })
          ),
          firstCall: fc.constantFrom(
            "deferred" as const,
            "lostResponse" as const
          ),
        }),
      },
      {
        weight: 1,
        arbitrary: fc.record({
          type: fc.constant("collidingMelts"),
          first: device,
          percents: fc.tuple(
            fc.integer({ min: 10, max: 90 }),
            fc.integer({ min: 10, max: 90 })
          ),
          endpoint: fc.constantFrom("swap" as const, "melt" as const),
          firstCall: fc.constantFrom(
            "deferred" as const,
            "lostResponse" as const
          ),
        }),
      },
      {
        weight: 3,
        arbitrary: fc.record({ type: fc.constant("jobTick"), device }),
      },
      {
        weight: 2,
        arbitrary: fc.record({
          type: fc.constant("sync"),
          device,
          online: fc.boolean(),
        }),
      },
      {
        weight: 1,
        arbitrary: fc.record({ type: fc.constant("crash"), device }),
      },
      {
        weight: 2,
        arbitrary: fc.record({
          type: fc.constant("advanceClock"),
          ms: fc.constantFrom(5_000, 60_000, 6 * 60_000, 15 * 60_000),
        }),
      },
      {
        weight: 3,
        arbitrary: faultArbitrary,
      },
      {
        weight: 2,
        arbitrary: fc.record({
          type: fc.constant("deliverDeferred"),
          index: fc.nat(5),
        }),
      },
      {
        weight: 2,
        arbitrary: fc.record({
          type: fc.constant("dropDeferred"),
          index: fc.nat(5),
        }),
      }
    )
    return fc.record({
      devices: fc.constant(devices),
      inputFeePpk: fc.constantFrom(0, 100),
      funding: fc.oneof(fc.constant(0), fc.integer({ min: 100, max: 3_000 })),
      heldAtRest: fc.constantFrom("deliver" as const, "drop" as const),
      actions: fc.array(action, {
        minLength: minActions,
        maxLength: maxActions,
        size: "max",
      }),
    })
  })

const toFakeMintFailure = (fault: SimFault): FakeMintFailure =>
  typeof fault === "string"
    ? { type: fault }
    : { type: "error", code: fault.code, detail: `simulated ${fault.code}` }

type SimDeps = CashuBackgroundJobContext

/**
 * One Payky device: its app database stays for the whole scenario, while
 * its memory — the job's state, the wallet cache, the counter lock — is a
 * session a crash throws away.
 */
const openSimDevice = async ({
  index,
  relayUrl,
  mint,
  clock,
}: {
  readonly index: number
  readonly relayUrl: string
  readonly mint: FakeCashuMint
  readonly clock: { readonly now: () => number }
}) => {
  await using disposer = new AsyncDisposableStack()
  const network = createSwitchableWebSocket()
  const { evolu, syncState } = disposer.use(
    await createEvoluTest({ createWebSocket: network.createWebSocket })
  )
  evolu.setMutationBackdate(clock.now())
  evolu.useOwner(evolu.appOwner, [
    createOwnerWebSocketTransport({
      url: relayUrl,
      ownerId: evolu.appOwner.id,
    }),
  ])
  const seed = deriveCashuWalletSeed(testCashuMasterKey)
  const dateDep = { date: { now: () => new Date(clock.now()) } }
  const errors: unknown[] = []
  const createDeps = (): SimDeps => ({
    evolu,
    evoluOwner: evolu.appOwner,
    masterKey: testCashuMasterKey,
    appOwnerSync: { state: (): AppOwnerSyncState => ({ type: "complete" }) },
    lockManager: testCreateLockManager(),
    fetch: mint.fetch,
    ...dateDep,
    ...createCashuWalletDep({ seed, fetch: mint.fetch }),
    ...createQerkoApiDep({ posId: "simulation" }),
    ...createEetApiDep({ ...dateDep, fetch: mint.fetch }),
    nostr: createFakeNostrDep().nostr,
    console: createConsole({ level: "silent" }),
    deviceId: `device-${index}` as DeviceId,
    connectivity: { onOnline: () => () => {} },
    onError: (error) => {
      errors.push(error)
    },
  })
  const openSession = () => {
    const run: DisposableRun<SimDeps> = testCreateRun(createDeps())
    return { run, sync: createCashuAccountSync(run) }
  }
  let session = openSession()
  const disposables = disposer.move()
  return {
    index,
    evolu,
    network,
    errors,
    get run() {
      return session.run
    },
    get sync() {
      return session.sync
    },
    syncRound: () => awaitSyncRound({ evolu, syncState }),
    /** Stamps this device's next writes at the simulated clock. */
    followClock: () => evolu.setMutationBackdate(clock.now()),
    /** Throws the device's memory away; its database stays and syncs on. */
    crash: async () => {
      await session.run[Symbol.asyncDispose]()
      session = openSession()
    },
    [Symbol.asyncDispose]: async () => {
      await session.run[Symbol.asyncDispose]()
      await disposables.disposeAsync()
    },
  }
}

type SimDevice = Awaited<ReturnType<typeof openSimDevice>>

/** What a step returned, without the random ids, for the trace. */
const outcomeOf = (result: unknown): string => {
  if (typeof result !== "object" || result === null) return String(result)
  if ("ok" in result && result.ok === false && "error" in result) {
    const error = result.error as { readonly type?: unknown }
    return `error:${String(error.type)}`
  }
  if ("ok" in result && result.ok === true && "value" in result) {
    const value = result.value as { readonly type?: unknown } | null
    return typeof value === "object" && value !== null && "type" in value
      ? `ok:${String(value.type)}`
      : "ok"
  }
  return "ok"
}

const attemptsQuery = createQuery((db) =>
  db
    .selectFrom("cashuOperationAttempt")
    .select([
      "operationId",
      "keysetId",
      "counter",
      "slots",
      "role",
      "isRejected",
      "isContested",
    ])
    .where("isDeleted", "is not", 1)
    .orderBy("keysetId")
    .orderBy("counter")
    .orderBy("operationId")
)

const countersQuery = createQuery((db) =>
  db.selectFrom("_cashuCounter").select(["keysetId", "next"])
)

/** What a device holds, without row ids that differ from run to run. */
const deviceStateOf = async (evolu: Evolu) => ({
  proofs: (await loadTestCashuProofs(evolu))
    .map((proof) => `${proof.secret}:${proof.amount}:${proof.state}`)
    .sort(),
  operations: (await loadTestCashuOperations(evolu))
    .map((operation) => `${operation.id}:${operation.kind}:${operation.status}`)
    .sort(),
  attempts: (await evolu.loadQuery(attemptsQuery)).map(
    (attempt) =>
      `${attempt.operationId}:${attempt.keysetId}:${attempt.counter}+${attempt.slots}:${attempt.role}:${attempt.isRejected ?? 0}:${attempt.isContested ?? 0}`
  ),
})

export type SimDeviceState = Awaited<ReturnType<typeof deviceStateOf>>

export interface SimResult {
  /** Each step with what it returned, then each round of the rest phase. */
  readonly trace: ReadonlyArray<string>
  readonly rested: boolean
  readonly devices: ReadonlyArray<SimDeviceState>
  /** Every proof the seed's restore finds at the mint, by secret. */
  readonly seedProofs: ReadonlyArray<{
    readonly secret: string
    readonly amount: number
    readonly spent: boolean
  }>
  readonly mintCalls: Readonly<Record<string, number>>
  /**
   * The paths the scenario reached, for tuning the generator: what the
   * steps returned, and what the devices ended with — blocks two operations
   * share, a block reserved twice, fenced melts, marks, final statuses.
   */
  readonly coverage: ReadonlyArray<string>
  readonly elapsedMs: number
}

/**
 * Plays `scenario` over a fresh relay and brings it to rest:
 * every held request delivered or dropped, every device online, the clock
 * past every grace and expiry, and job passes on every device until
 * `STABLE_ROUNDS` rounds in a row change nothing.
 */
export const runCashuScenario = async (
  scenario: SimScenario
): Promise<SimResult> => {
  const started = performance.now()
  await using disposer = new AsyncDisposableStack()
  // A relay of its own: what an earlier scenario left there is the same
  // account's, and would sync in.
  const relay = disposer.use(await createTestRelay())
  const relayUrl = relay.url
  let nowMs: number = SIMULATION_START_MS
  const clock = { now: () => nowMs }
  const mint = createFakeCashuMint({
    url: testMintUrl,
    inputFeePpk: scenario.inputFeePpk,
    now: clock.now,
  })
  const devices: SimDevice[] = []
  for (let index = 0; index < scenario.devices; index += 1)
    devices.push(
      disposer.use(await openSimDevice({ index, relayUrl, mint, clock }))
    )
  const trace: string[] = []
  const coverage = new Set<string>()
  const topups: Array<{
    readonly operationId: CashuOperationId
    readonly quoteId: string
  }> = []
  let melts = 0

  const syncOnline = async () => {
    const online = devices.filter((device) => device.network.online)
    // The first pass puts every device's writes on the relay, the second
    // brings each device what the others put there.
    for (const device of online) await device.syncRound()
    for (const device of online) await device.syncRound()
  }
  const advance = (ms: number) => {
    nowMs += ms
    for (const device of devices) device.followClock()
  }
  const recentTopup = (back: number) =>
    topups.length === 0
      ? undefined
      : topups[topups.length - 1 - (back % topups.length)]
  const deviceAt = (index: number): SimDevice => {
    const device = devices[index % devices.length]
    if (device === undefined) throw new Error("no device")
    return device
  }
  const tick = async (device: SimDevice) => {
    await device.sync.settle()
    await device.sync.tokens.tick()
  }

  // The account as the merchant set it up on the first device: Cashu
  // enabled, the test mint trusted, synced to every device before the steps.
  const first = deviceAt(0)
  await first.run.ok(saveCashuAccount({ enabled: true }))
  await runMutationWithCompletion((options) =>
    first.evolu.upsert(
      "cashuMintTrust",
      {
        id: cashuMintTrustId,
        trustedMintsJson: z.encode(CashuTrustedMintsJson, [testMintUrl]),
      },
      { ...options, owner: first.evolu.appOwner }
    )
  )
  if (scenario.funding > 0) {
    const quote = await first.run.orThrow(
      createCashuTopupQuote({
        mint: testMintUrl,
        amount: CashuAmount(scenario.funding),
        purpose: "move",
      })
    )
    mint.payMintQuote(quote.quoteId)
    await first.run.orThrow(claimCashuTopup(quote.operationId))
  }
  await syncOnline()

  /** A withdrawal of `percent` of the device's balance to a fresh invoice. */
  const meltOn = async (device: SimDevice, percent: number) => {
    melts += 1
    const balance = await testCashuBalance(device.evolu)
    const amount = Math.max(1, Math.floor((balance * percent) / 100))
    const invoice = createTestInvoice({
      hrp: `lnbc${amount * 10}n`,
      timestamp: Math.floor(nowMs / 1000),
      expirySeconds: 3_600,
      description: `simulated withdrawal ${melts}`,
      paymentHash: bytesToHex(
        sha256(new TextEncoder().encode(`melt ${melts}`))
      ),
    })
    const cost = await device.run(
      quoteCashuMelt({ mint: testMintUrl, invoice })
    )
    if (!cost.ok) return outcomeOf(cost)
    return outcomeOf(
      await device.run(
        meltCashu({
          mint: testMintUrl,
          invoice,
          quoteId: cost.value.quoteId,
          maxTotal: cost.value.maxTotal,
          purpose: "withdrawal",
        })
      )
    )
  }

  const step = async (action: SimAction): Promise<string> => {
    switch (action.type) {
      case "topup": {
        const device = deviceAt(action.device)
        const quote = await device.run(
          createCashuTopupQuote({
            mint: testMintUrl,
            amount: CashuAmount(action.amount),
            purpose: "move",
          })
        )
        if (quote.ok)
          topups.push({
            operationId: quote.value.operationId,
            quoteId: quote.value.quoteId,
          })
        return outcomeOf(quote)
      }
      case "customerPays": {
        const topup = recentTopup(action.topup)
        if (topup === undefined) return "skip"
        mint.payMintQuote(topup.quoteId)
        return "ok"
      }
      case "claim": {
        const topup = recentTopup(action.topup)
        if (topup === undefined) return "skip"
        return outcomeOf(
          await deviceAt(action.device).run(claimCashuTopup(topup.operationId))
        )
      }
      case "melt":
        return meltOn(deviceAt(action.device), action.percent)
      case "collidingClaims": {
        const pair = [deviceAt(action.first), deviceAt(action.first + 1)]
        const outcomes: string[] = []
        for (const device of pair) device.network.setOnline(false)
        const quotes = []
        for (const [index, device] of pair.entries()) {
          const quote = await device.run(
            createCashuTopupQuote({
              mint: testMintUrl,
              amount: CashuAmount(action.amounts[index] ?? 1),
              purpose: "move",
            })
          )
          if (!quote.ok) return outcomeOf(quote)
          topups.push({
            operationId: quote.value.operationId,
            quoteId: quote.value.quoteId,
          })
          mint.payMintQuote(quote.value.quoteId)
          quotes.push(quote.value.operationId)
        }
        mint.failNext("mint", { type: action.firstCall })
        for (const [index, device] of pair.entries()) {
          const operationId = quotes[index]
          if (operationId === undefined) continue
          outcomes.push(
            outcomeOf(await device.run(claimCashuTopup(operationId)))
          )
        }
        return outcomes.join("/")
      }
      case "collidingMelts": {
        const pair = [deviceAt(action.first), deviceAt(action.first + 1)]
        for (const device of pair) device.network.setOnline(false)
        mint.failNext(action.endpoint, { type: action.firstCall })
        const outcomes: string[] = []
        for (const [index, device] of pair.entries())
          outcomes.push(await meltOn(device, action.percents[index] ?? 50))
        return outcomes.join("/")
      }
      case "jobTick":
        await tick(deviceAt(action.device))
        return "ok"
      case "sync":
        deviceAt(action.device).network.setOnline(action.online)
        return "ok"
      case "crash":
        await deviceAt(action.device).crash()
        return "ok"
      case "advanceClock":
        advance(action.ms)
        return "ok"
      case "fault":
        mint.failNext(action.endpoint, toFakeMintFailure(action.fault))
        return "ok"
      case "deliverDeferred":
      case "dropDeferred": {
        const held = mint.deferredRequests()
        const request = held[action.index % Math.max(held.length, 1)]
        if (request === undefined) return "skip"
        if (action.type === "dropDeferred") {
          mint.dropDeferred(request.id)
          return `dropped:${request.endpoint}`
        }
        const delivered = mint.deliverDeferred(request.id)
        return `delivered:${request.endpoint}:${delivered.ok ? "ok" : refusalCodeOf(delivered.error)}`
      }
    }
  }

  for (const [index, action] of scenario.actions.entries()) {
    advance(STEP_MS)
    let outcome: string
    try {
      outcome = await step(action)
    } catch (error) {
      outcome = `threw:${error instanceof Error ? error.message : String(error)}`
    }
    // A fault is meant for the step after it: one no call hit by then
    // does not linger to strike at random later.
    if (action.type !== "fault") mint.clearFailures()
    await syncOnline()
    trace.push(`${index} ${JSON.stringify(action)} -> ${outcome}`)
    if (!uncoveredActions.has(action.type))
      coverage.add(`${action.type} -> ${outcome}`)
  }

  // The rest phase.
  const settleHeld = () => {
    for (const request of mint.deferredRequests())
      if (scenario.heldAtRest === "drop") mint.dropDeferred(request.id)
      else mint.deliverDeferred(request.id)
  }
  // At rest the mint answers: faults queued and never hit do not happen.
  mint.clearFailures()
  for (const device of devices) device.network.setOnline(true)
  settleHeld()
  await syncOnline()
  advance(2 * 60 * 60_000)
  let stable = 0
  let previous = ""
  let rested = false
  for (let round = 0; round < MAX_REST_ROUNDS; round += 1) {
    settleHeld()
    advance(REST_ROUND_MS)
    for (const device of devices) {
      try {
        await tick(device)
      } catch (error) {
        trace.push(
          `rest ${round} device ${device.index} threw:${error instanceof Error ? error.message : String(error)}`
        )
      }
      await syncOnline()
    }
    const state = JSON.stringify(
      await Promise.all(devices.map((device) => deviceStateOf(device.evolu)))
    )
    stable =
      state === previous && mint.deferredRequests().length === 0
        ? stable + 1
        : 0
    previous = state
    if (stable >= STABLE_ROUNDS) {
      trace.push(`rested after ${round + 1} rounds`)
      rested = true
      break
    }
  }
  if (!rested) trace.push(`no rest after ${MAX_REST_ROUNDS} rounds`)

  const deviceStates = await Promise.all(
    devices.map((device) => deviceStateOf(device.evolu))
  )
  const mintCalls = Object.fromEntries(
    faultedEndpoints.map((endpoint) => [endpoint, mint.requestCount(endpoint)])
  )
  const seedProofs = await restoreSeedProofs(mint, devices)
  for (const label of coverageOfStates(deviceStates)) coverage.add(label)
  return {
    trace,
    rested,
    devices: deviceStates,
    seedProofs,
    mintCalls,
    coverage: [...coverage].sort(),
    elapsedMs: performance.now() - started,
  }
}

/** Steps whose outcome says nothing about the path a scenario took. */
const uncoveredActions: ReadonlySet<SimAction["type"]> = new Set([
  "sync",
  "crash",
  "advanceClock",
  "fault",
  "jobTick",
  "customerPays",
])

const refusalCodeOf = (error: unknown): string =>
  typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "refused"

/** What the devices' final rows show of the paths the scenario reached. */
const coverageOfStates = (
  states: ReadonlyArray<SimDeviceState>
): ReadonlyArray<string> => {
  const labels = new Set<string>()
  for (const state of states) {
    for (const operation of state.operations) {
      const [, kind, status] = operation.split(":")
      labels.add(`operation ${kind} ${status}`)
    }
    const attempts = state.attempts.map((attempt) => {
      const [operationId, keysetId, range, role, isRejected, isContested] =
        attempt.split(":")
      const [counter, slots] = (range ?? "").split("+").map(Number)
      return {
        operationId,
        keysetId,
        start: counter ?? 0,
        end: (counter ?? 0) + (slots ?? 0),
        role,
        isRejected: isRejected === "1",
        isContested: isContested === "1",
      }
    })
    for (const attempt of attempts) {
      if (attempt.isRejected) labels.add("attempt rejected")
      if (attempt.isContested) labels.add("attempt contested")
    }
    for (const [index, a] of attempts.entries())
      for (const b of attempts.slice(index + 1)) {
        if (a.keysetId !== b.keysetId || a.start >= b.end || b.start >= a.end)
          continue
        labels.add(
          a.operationId === b.operationId
            ? "block reserved twice"
            : "block shared by two operations"
        )
      }
    const preSwapsOf = new Map<string, number>()
    for (const attempt of attempts)
      if (attempt.role === "meltSwap")
        preSwapsOf.set(
          attempt.operationId ?? "",
          (preSwapsOf.get(attempt.operationId ?? "") ?? 0) + 1
        )
    if ([...preSwapsOf.values()].some((count) => count > 1))
      labels.add("melt fenced")
  }
  return [...labels]
}

/** Slots restored per call; past the last slot any device used. */
const RESTORE_BATCH = 200

/**
 * Every proof the account's seed holds at the mint, found as a new wallet
 * would: a NUT-09 restore of every keyset over every slot any device's
 * counter or attempt reached.
 */
const restoreSeedProofs = async (
  mint: FakeCashuMint,
  devices: ReadonlyArray<SimDevice>
) => {
  const ends = new Map<string, number>()
  for (const device of devices) {
    for (const attempt of await device.evolu.loadQuery(attemptsQuery))
      ends.set(
        attempt.keysetId ?? "",
        Math.max(
          ends.get(attempt.keysetId ?? "") ?? 0,
          (attempt.counter ?? 0) + (attempt.slots ?? 0)
        )
      )
    for (const counter of await device.evolu.loadQuery(countersQuery))
      ends.set(
        counter.keysetId ?? "",
        Math.max(ends.get(counter.keysetId ?? "") ?? 0, counter.next ?? 0)
      )
  }
  const { cashuWallet } = createCashuWalletDep({
    seed: deriveCashuWalletSeed(testCashuMasterKey),
    fetch: mint.fetch,
  })
  const wallet = await cashuWallet.load(testMintUrl)
  const proofs: Array<{
    readonly secret: string
    readonly amount: number
    readonly spent: boolean
  }> = []
  for (const [keysetId, end] of ends) {
    if (keysetId === "") continue
    for (let start = 0; start < end; start += RESTORE_BATCH) {
      const restored = await wallet.restore(start, RESTORE_BATCH, { keysetId })
      for (const proof of restored.proofs)
        proofs.push({
          secret: proof.secret,
          amount: Number(proof.amount),
          spent: mint.isSpent(proof.secret),
        })
    }
  }
  return proofs.sort((a, b) => a.secret.localeCompare(b.secret))
}

/**
 * Invariant 1: the balance matches the mint. Every proof of the seed the
 * mint holds unspent is `available` on every device, and every proof a
 * device holds `available` is unspent at the mint. Returns what breaks it.
 */
export const balanceMatchesMint = (
  result: SimResult
): ReadonlyArray<string> => {
  const unspent = new Set(
    result.seedProofs
      .filter((proof) => !proof.spent)
      .map((proof) => `${proof.secret}:${proof.amount}`)
  )
  return result.devices.flatMap((device, index) => {
    const available = new Set(
      device.proofs
        .filter((proof) => proof.endsWith(":available"))
        .map((proof) => proof.slice(0, -":available".length))
    )
    return [
      ...[...unspent]
        .filter((proof) => !available.has(proof))
        .map((proof) => `device ${index} lacks unspent ${proof}`),
      ...[...available]
        .filter((proof) => !unspent.has(proof))
        .map(
          (proof) => `device ${index} counts ${proof}, not unspent at the mint`
        ),
    ]
  })
}

/**
 * Invariant 2: nothing is left pending. No device holds an operation
 * `pending` or a proof `held` once the scenario rests. Returns what breaks
 * it.
 */
export const nothingPending = (result: SimResult): ReadonlyArray<string> =>
  result.devices.flatMap((device, index) => [
    ...device.operations
      .filter((operation) => operation.endsWith(":pending"))
      .map((operation) => `device ${index} has ${operation}`),
    ...device.proofs
      .filter((proof) => proof.endsWith(":held"))
      .map((proof) => `device ${index} holds ${proof}`),
  ])
