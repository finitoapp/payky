import { err, type LockManagerDep, ok, type Task } from "@evolu/common"
import { z } from "zod"

import type { DateDep, EvoluOwnerIdDep, MasterKeyDep } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import {
  loadLiveAccountIds,
  upsertStationPaymentAccountRows,
} from "@/core/modules/account/account-actions.ts"
import { upsertStationSettingsRow } from "@/core/modules/app-settings/app-settings-actions.ts"
import {
  loadEmployeeIds,
  upsertMirroredEmployeeRows,
} from "@/core/modules/employee/employee-actions.ts"
import type { EmployeeId } from "@/core/modules/employee/employee-types.ts"
import { markPaymentPaidIban } from "@/core/modules/payment/payment-actions.ts"
import {
  paymentIbanDetailsByIdQuery,
  paymentSparkDetailsByIdQuery,
} from "@/core/modules/payment/payment-queries.ts"
import { recordAutomaticAccountTransaction } from "@/core/modules/reconciliation-claim/reconciliation-claim-actions.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/evolu-utils.ts"
import { deriveDefaultSparkWalletSecret } from "@/core/modules/shared/key-derivation.ts"
import {
  IntegerSchema,
  NonEmptyStringSchema,
  type NonNegativeInteger,
  type Sha256Hex,
} from "@/core/modules/shared/schema.ts"
import {
  isNewerStationConfig,
  stationConfigRowId,
  stationSessionRowId,
} from "./station-config-utils.ts"
import { syncStationOutbox } from "./station-outbox-actions.ts"
import {
  type OwnerToStationMessage,
  StationConfigJson,
} from "./station-protocol.ts"
import { currentEmployeeQuery, stationConfigQuery } from "./station-queries.ts"
import { sha256Hex } from "./station-report-utils.ts"

const createStationConfigInvalidError = defineError("StationConfigInvalid")<{
  readonly reason: "hash" | "schema" | "station"
}>()
export type StationConfigInvalidError = ReturnType<
  typeof createStationConfigInvalidError
>

/**
 * Applies a config the owner sent, when it is newer than the one applied
 * (station/0008): the owner's accounts under the owner's ids, its employees,
 * its currency, tips and method order, all in one batch, so a station never
 * runs on half of one config. Returns whether it applied.
 */
export const applyStationConfig =
  ({
    version,
    hash,
    configJson,
  }: {
    readonly version: NonNegativeInteger
    readonly hash: Sha256Hex
    readonly configJson: string
  }): Task<
    boolean,
    StationConfigInvalidError,
    EvoluDep & EvoluOwnerIdDep & MasterKeyDep
  > =>
  async (run) => {
    if (sha256Hex(configJson) !== hash) {
      return err(createStationConfigInvalidError({ reason: "hash" }))
    }
    const decoded = z.safeDecode(StationConfigJson, configJson)
    if (!decoded.success) {
      return err(createStationConfigInvalidError({ reason: "schema" }))
    }
    const config = decoded.data

    const { evolu, evoluOwnerId } = run.deps
    const [[current], [currentEmployee], accountIds, employeeIds] =
      await Promise.all([
        evolu.loadQuery(stationConfigQuery),
        evolu.loadQuery(currentEmployeeQuery),
        run.ok(loadLiveAccountIds()),
        run.ok(loadEmployeeIds()),
      ])
    if (current !== undefined && current.stationId !== config.stationId) {
      return err(createStationConfigInvalidError({ reason: "station" }))
    }
    if (!isNewerStationConfig({ version, hash }, current)) return ok(false)

    await runMutationWithCompletion((batch) => {
      const options = { ...batch, ownerId: evoluOwnerId }

      upsertStationPaymentAccountRows(
        evolu,
        {
          cashRegister:
            config.cash === null
              ? null
              : { id: config.cash.accountId, currency: config.cash.currency },
          iban:
            config.iban === null
              ? null
              : {
                  id: config.iban.accountId,
                  iban: config.iban.iban,
                  currency: config.iban.currency,
                  name: config.iban.name,
                  defaultQrFormat: config.iban.defaultQrFormat,
                },
          spark:
            config.spark === null
              ? null
              : {
                  id: config.spark.accountId,
                  secret: deriveDefaultSparkWalletSecret(run.deps.masterKey),
                  receiverIdentityPubkey: config.spark.receiverIdentityPubkey,
                },
          currentIds: accountIds,
        },
        options
      )
      upsertMirroredEmployeeRows(
        evolu,
        { employees: config.employees, currentIds: employeeIds },
        options
      )
      upsertStationSettingsRow(
        evolu,
        {
          fiatCurrency: config.currency,
          tips: config.tips,
          paymentMethodOrder: config.paymentMethodOrder,
        },
        options
      )
      if (
        currentEmployee !== undefined &&
        !config.employees.some((employee) => employee.id === currentEmployee.id)
      ) {
        evolu.upsert(
          "stationSession",
          { id: stationSessionRowId, employeeId: null },
          options
        )
      }
      evolu.upsert(
        "stationConfig",
        {
          id: stationConfigRowId,
          stationId: config.stationId,
          name: config.name,
          number: config.number,
          version,
          hash,
          configJson: NonEmptyStringSchema.decode(configJson),
        },
        options
      )
    })

    return ok(true)
  }

/**
 * Records what the owner settled for a station payment (station/0006): a
 * bank transfer it received, or a Lightning transfer into its wallet. Then
 * the payment is reported again, now paid.
 */
export const applyStationSettlement =
  (
    message: Extract<OwnerToStationMessage, { readonly type: "settled" }>
  ): Task<void, never, EvoluDep & EvoluOwnerIdDep & DateDep & LockManagerDep> =>
  async (run) => {
    const { evolu } = run.deps
    const { paymentId, occurredAt } = message

    if (message.method === "iban") {
      const [iban] = await evolu.loadQuery(
        paymentIbanDetailsByIdQuery(paymentId)
      )
      if (iban === undefined) return ok()
      const result = await run(
        markPaymentPaidIban({
          paymentId,
          accountId: iban.accountId,
          occurredAt,
        })
      )
      if (!result.ok) {
        run.deps.console.warn("[station] Could not record a bank settlement.", {
          paymentId,
          error: result.error,
        })
        return ok()
      }
    } else {
      const [spark] = await evolu.loadQuery(
        paymentSparkDetailsByIdQuery(paymentId)
      )
      if (
        spark === undefined ||
        spark.lnInvoice === null ||
        message.sparkTransferId === null
      ) {
        return ok()
      }
      await run.ok(
        recordAutomaticAccountTransaction({
          accountId: spark.accountId,
          amount: IntegerSchema.decode(spark.amountSats),
          currency: "BTC",
          occurredAt,
          note: null,
          internalTransferGroupId: null,
          source: { deviceId: null, source: "auto" },
          spark: {
            sparkTransferId: message.sparkTransferId,
            lightning: {
              lnInvoice: spark.lnInvoice,
              preImage: null,
              paymentHash: null,
            },
          },
        })
      )
    }

    await run.ok(syncStationOutbox({ paymentIds: [paymentId] }))
    return ok()
  }

/** Who takes the station's next payments; `null` for nobody. */
export const setCurrentEmployee =
  (
    employeeId: EmployeeId | null
  ): Task<void, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    await runMutationWithCompletion((options) =>
      run.deps.evolu.upsert(
        "stationSession",
        { id: stationSessionRowId, employeeId },
        { ...options, ownerId: run.deps.evoluOwnerId }
      )
    )
    return ok()
  }
