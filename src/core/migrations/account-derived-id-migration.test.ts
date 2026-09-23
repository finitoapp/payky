import {
  createIdFromString,
  evoluJsonObjectFrom,
  sqliteFalse,
  sqliteTrue,
  testCreateRun,
} from "@evolu/common"
import { expect, test } from "vitest"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import { accountDerivedIdMigration } from "@/core/migrations/account-derived-id-migration.ts"
import {
  accountByIdQuery,
  fiatBankAccountQuery,
} from "@/core/modules/account/account-queries.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import {
  createCashRegisterAccountId,
  createIbanAccountId,
  createSparkAccountId,
  legacyFiatBankAccountId,
} from "@/core/modules/account/account-utils.ts"
import { fioPluginByIdQuery } from "@/core/modules/fio-plugin/fio-plugin-queries.ts"
import { fioPluginId } from "@/core/modules/fio-plugin/fio-plugin-utils.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  createRowId,
  runMutationWithCompletion,
} from "@/core/modules/shared/evolu-utils.ts"
import { SparkSecret } from "@/core/modules/shared/key-derivation.ts"
import {
  IbanSchema,
  NonEmptyString255,
  PositiveInteger,
  TimestampMs,
} from "@/core/modules/shared/schema.ts"
import { createEvoluTest } from "../evolu/cli-client"

const accountWithDetailsByIdQuery = (id: AccountId) =>
  createQuery((db) =>
    db
      .selectFrom("account")
      .select((eb) => [
        "account.name",
        "account.kind",
        "account.isDeleted",
        evoluJsonObjectFrom(
          eb
            .selectFrom("accountSpark")
            .select(["accountSpark.secret"])
            .whereRef("accountSpark.id", "=", "account.id")
        ).as("spark"),
        evoluJsonObjectFrom(
          eb
            .selectFrom("accountCashRegister")
            .select(["accountCashRegister.currency"])
            .whereRef("accountCashRegister.id", "=", "account.id")
        ).as("cashRegister"),
      ])
      .where("account.id", "=", id)
  )

const sparkAccountSyncPointerByIdQuery = (id: AccountId) =>
  createQuery((db) =>
    db
      .selectFrom("sparkAccountSyncPointer")
      .select(["lastSyncedAt"])
      .where("id", "=", id)
  )

/**
 * The shapes the versions before derived ids left behind: the app's fixed
 * singleton ids (a live Spark account with a sync pointer, a disabled bank
 * account the Fio plugin points at) and a random id `createAccount` minted.
 */
test("moves legacy accounts onto their derived ids", async () => {
  await using testEvolu = await createEvoluTest()
  const { evolu } = testEvolu
  const deps = {
    evolu,
    evoluOwnerId: evolu.appOwner.id,
  } satisfies EvoluDep & EvoluOwnerIdDep
  await using run = testCreateRun(deps)
  const legacySparkId = createIdFromString<"Account">("payky-spark-account")
  const legacyCashRegisterId = createRowId<"Account">()
  const secret = SparkSecret("42373a7543db65ae0228ead6c9cbffcc")
  const iban = IbanSchema.decode("CZ6508000000192000145399")
  const sparkId = createSparkAccountId(secret)
  const ibanId = createIbanAccountId({ iban, currency: "CZK" })
  const cashRegisterId = createCashRegisterAccountId("EUR")

  await runMutationWithCompletion((options) => {
    const mutationOptions = { ...options, ownerId: evolu.appOwner.id }

    evolu.upsert("accountSpark", { id: legacySparkId, secret }, mutationOptions)
    evolu.upsert(
      "account",
      {
        id: legacySparkId,
        deviceId: null,
        name: NonEmptyString255("Spark account"),
        kind: "spark",
        isDeleted: sqliteFalse,
      },
      mutationOptions
    )
    evolu.upsert(
      "sparkAccountSyncPointer",
      {
        id: legacySparkId,
        lastSyncedAt: TimestampMs(Date.parse("2026-09-01T00:00:00.000Z")),
      },
      mutationOptions
    )
    evolu.upsert(
      "accountIban",
      {
        id: legacyFiatBankAccountId,
        iban,
        currency: "CZK",
        defaultQrFormat: "payBySquare1_2_0",
      },
      mutationOptions
    )
    evolu.upsert(
      "account",
      {
        id: legacyFiatBankAccountId,
        deviceId: null,
        name: NonEmptyString255("Fiat bank account"),
        kind: "iban",
        isDeleted: sqliteTrue,
      },
      mutationOptions
    )
    evolu.upsert(
      "fioPlugin",
      {
        id: fioPluginId,
        accountId: legacyFiatBankAccountId,
        numberOfSecondsBetweenChecks: PositiveInteger(60),
        syncLookbackDays: PositiveInteger(1),
        isActive: sqliteTrue,
      },
      mutationOptions
    )
    evolu.upsert(
      "accountCashRegister",
      { id: legacyCashRegisterId, currency: "EUR" },
      mutationOptions
    )
    evolu.upsert(
      "account",
      {
        id: legacyCashRegisterId,
        deviceId: null,
        name: NonEmptyString255("Till"),
        kind: "cashRegister",
        isDeleted: sqliteFalse,
      },
      mutationOptions
    )
  })

  await expect(run(accountDerivedIdMigration.hasWork)).resolves.toEqual({
    ok: true,
    value: true,
  })

  await run.ok(accountDerivedIdMigration.run)

  await expect
    .poll(() => evolu.loadQuery(accountWithDetailsByIdQuery(sparkId)))
    .toMatchObject([
      {
        name: "Spark account",
        kind: "spark",
        isDeleted: sqliteFalse,
        spark: { secret },
      },
    ])
  await expect
    .poll(() => evolu.loadQuery(sparkAccountSyncPointerByIdQuery(sparkId)))
    .toMatchObject([{ lastSyncedAt: Date.parse("2026-09-01T00:00:00.000Z") }])
  // Disabled stays disabled, with its configuration kept for re-enabling.
  await expect
    .poll(() => evolu.loadQuery(fiatBankAccountQuery))
    .toMatchObject([
      {
        id: ibanId,
        isDeleted: sqliteTrue,
        defaultQrFormat: "payBySquare1_2_0",
      },
    ])
  await expect
    .poll(() => evolu.loadQuery(fioPluginByIdQuery(fioPluginId)))
    .toMatchObject([{ accountId: ibanId }])
  await expect
    .poll(() => evolu.loadQuery(accountWithDetailsByIdQuery(cashRegisterId)))
    .toMatchObject([
      {
        name: "Till",
        isDeleted: sqliteFalse,
        cashRegister: { currency: "EUR" },
      },
    ])

  // The legacy rows are tombstoned, so nothing syncs a wallet twice.
  await expect
    .poll(() => evolu.loadQuery(accountByIdQuery(legacySparkId)))
    .toMatchObject([{ isDeleted: sqliteTrue }])
  await expect
    .poll(() => evolu.loadQuery(accountByIdQuery(legacyCashRegisterId)))
    .toMatchObject([{ isDeleted: sqliteTrue }])

  // And a second pass finds nothing left to do.
  await expect(run(accountDerivedIdMigration.hasWork)).resolves.toEqual({
    ok: true,
    value: false,
  })
}, 15_000)
