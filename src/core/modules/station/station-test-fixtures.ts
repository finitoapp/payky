import {
  sqliteFalse,
  sqliteTrue,
  testCreateConsole,
  testCreateRun,
} from "@evolu/common"

import type { AppBackgroundJobContext } from "@/core/background-jobs/background-job-types.ts"
import { createInProcessLockManager } from "@/core/cli/in-process-lock-manager.ts"
import { createEvoluTest } from "@/core/evolu/cli-client.ts"
import { createEetApiDep } from "@/core/integrations/eet/eet-client.ts"
import { createFakeNostrRelay } from "@/core/integrations/nostr/nostr-test-fixtures.ts"
import { createAccount } from "@/core/modules/account/account-actions.ts"
import { completeOnboarding } from "@/core/modules/app-settings/app-settings-actions.ts"
import { createEmployee } from "@/core/modules/employee/employee-actions.ts"
import { createRowId } from "@/core/modules/shared/evolu-utils.ts"
import { MasterKey, SparkSecret } from "@/core/modules/shared/key-derivation.ts"
import {
  IbanSchema,
  NonEmptyString255,
  NonNegativeInteger,
  SparkIdentityPubkey,
} from "@/core/modules/shared/schema.ts"
import type {
  SharedSparkSyncWallet,
  SparkPaymentWallet,
} from "@/core/spark/spark-wallet.ts"
import { createFakeSparkWallet } from "@/core/spark/spark-wallet-test-fixtures.ts"
import { createTestDateDep } from "@/test/date-dep.ts"
import { createStation } from "./station-actions.ts"
import {
  buildStationConfig,
  serializeStationConfig,
} from "./station-config-utils.ts"
import { getStationCommsPubkey } from "./station-identity-utils.ts"
import { stationByIdQuery } from "./station-queries.ts"

export const ownerMasterKey = MasterKey("000102030405060708090a0b0c0d0e0f")
export const ownerSparkIdentityPubkey = `02${"ab".repeat(32)}`

const notImplemented = (): never => {
  throw new Error("not implemented")
}

/** The owner's wallet as the owner job reads it: only its identity key. */
const fakeSparkSyncWallet: SharedSparkSyncWallet = {
  getTransfers: notImplemented,
  getTransfer: notImplemented,
  getIdentityPublicKey: async () => ownerSparkIdentityPubkey,
  subscribe: () => () => undefined,
  [Symbol.asyncDispose]: async () => {},
}

const createJobDeps = (onError: (error: unknown) => void) => ({
  console: testCreateConsole(),
  deviceId: createRowId<"Device">(),
  connectivity: { onOnline: () => () => undefined },
  lockManager: createInProcessLockManager(),
  onError,
})

/**
 * An owner with a cash register, a bank account, a Spark wallet, settings,
 * an employee and one PoS station, and that station's own empty database,
 * the two talking through one in-memory relay.
 */
export const createStationTestContext = async ({
  stationWallet = createFakeSparkWallet({}),
}: {
  readonly stationWallet?: SparkPaymentWallet
} = {}) => {
  const disposer = new AsyncDisposableStack()
  const ownerEvolu = disposer.use(await createEvoluTest()).evolu
  const stationEvolu = disposer.use(await createEvoluTest()).evolu
  const clock = createTestDateDep()
  const relay = createFakeNostrRelay()
  const errors: unknown[] = []
  const revocations: string[] = []
  const onError = (error: unknown) => {
    errors.push(error)
  }

  const ownerDeps: AppBackgroundJobContext & {
    readonly masterKey: MasterKey
    readonly nostr: typeof relay.nostr
    readonly sparkSyncWallet: {
      readonly create: () => Promise<SharedSparkSyncWallet>
    }
  } = {
    ...createJobDeps(onError),
    evolu: ownerEvolu,
    evoluOwnerId: ownerEvolu.appOwner.id,
    date: clock.date,
    fetch: notImplemented,
    ...createEetApiDep({ date: clock.date, fetch: notImplemented }),
    masterKey: ownerMasterKey,
    nostr: relay.nostr,
    sparkSyncWallet: { create: async () => fakeSparkSyncWallet },
  }

  await using ownerRun = testCreateRun(ownerDeps)
  const cashAccountId = await ownerRun.ok(
    createAccount({
      deviceId: null,
      name: NonEmptyString255("Cash register"),
      cashRegister: { currency: "CZK" },
    })
  )
  const ibanAccountId = await ownerRun.ok(
    createAccount({
      deviceId: null,
      name: NonEmptyString255("Bank"),
      iban: {
        iban: IbanSchema.parse("CZ6508000000192000145399"),
        currency: "CZK",
      },
    })
  )
  const sparkAccountId = await ownerRun.ok(
    createAccount({
      deviceId: null,
      name: NonEmptyString255("Spark account"),
      spark: { secret: SparkSecret("0123456789abcdef0123456789abcdef") },
    })
  )
  await ownerRun.ok(
    completeOnboarding({
      fiatCurrency: "CZK",
      defaultPaymentMethod: "cashRegister",
      paymentMethodOrderJson: '["cashRegister","iban","spark"]',
    })
  )
  const employeeId = await ownerRun.ok(
    createEmployee({ name: NonEmptyString255("Anna") })
  )
  const stationId = await ownerRun.orThrow(
    createStation({ name: NonEmptyString255("Bar") })
  )
  const [station] = await ownerEvolu.loadQuery(stationByIdQuery(stationId))
  if (station === undefined) throw new Error("The station was not created.")

  const stationDeps = {
    ...createJobDeps(onError),
    evolu: stationEvolu,
    evoluOwnerId: stationEvolu.appOwner.id,
    date: clock.date,
    fetch: notImplemented,
    ...createEetApiDep({ date: clock.date, fetch: notImplemented }),
    masterKey: station.masterKey,
    nostr: relay.nostr,
    sparkWallet: { create: async () => stationWallet },
    stationAccount: {
      ownerPubkey: getStationCommsPubkey(ownerMasterKey),
      onRevoked: async () => {
        revocations.push(stationId)
      },
    },
  }

  return {
    ownerDeps,
    stationDeps,
    clock,
    relay,
    errors,
    revocations,
    stationId,
    station,
    employeeId,
    cashAccountId,
    ibanAccountId,
    sparkAccountId,
    [Symbol.asyncDispose]: () => disposer.disposeAsync(),
  }
}

export type StationTestContext = Awaited<
  ReturnType<typeof createStationTestContext>
>

/**
 * The config the owner job would send the context's station, as sent:
 * version, hash and JSON.
 */
export const createTestStationConfigMessage = (
  context: StationTestContext,
  {
    version = 1,
    employees = [{ id: context.employeeId, name: NonEmptyString255("Anna") }],
    disabledMethods = [],
  }: {
    readonly version?: number
    readonly employees?: ReadonlyArray<{
      readonly id: StationTestContext["employeeId"]
      readonly name: NonEmptyString255
    }>
    /** The methods the owner turned off for the station. */
    readonly disabledMethods?: ReadonlyArray<"cash" | "iban" | "spark">
  } = {}
) => {
  const enabled = (method: "cash" | "iban" | "spark") =>
    disabledMethods.includes(method) ? sqliteFalse : sqliteTrue
  const { configJson, hash } = serializeStationConfig(
    buildStationConfig({
      station: {
        ...context.station,
        cashEnabled: enabled("cash"),
        ibanEnabled: enabled("iban"),
        sparkEnabled: enabled("spark"),
      },
      settings: {
        fiatCurrency: "CZK",
        tipsEnabled: 1,
        presetTipPercentagesJson: "[10]",
        presetTipFixedAmountsJson: "[2000]",
        paymentMethodOrderJson: '["cashRegister","iban","spark"]',
        defaultPaymentMethod: "cashRegister",
      },
      employees,
      cash: { id: context.cashAccountId, currency: "CZK" },
      iban: {
        id: context.ibanAccountId,
        iban: IbanSchema.parse("CZ6508000000192000145399"),
        currency: "CZK",
        name: NonEmptyString255("Bank"),
        defaultQrFormat: "spayd",
      },
      spark: {
        id: context.sparkAccountId,
        receiverIdentityPubkey: SparkIdentityPubkey(ownerSparkIdentityPubkey),
      },
    })
  )
  return { version: NonNegativeInteger(version), hash, configJson }
}
