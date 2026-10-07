import {
  type DateIso,
  evoluJsonArrayFrom,
  type InferRow,
  type KyselyNotNull,
  sqliteTrue,
} from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import type { TimestampMs } from "@/core/modules/shared/schema.ts"
import {
  stationConfigRowId,
  stationSessionRowId,
} from "./station-config-utils.ts"
import type { StationId } from "./station-types.ts"

// Owner side

/** Every station, revoked ones too, by number. */
export const stationsQuery = createQuery((db) =>
  db
    .selectFrom("station")
    .select([
      "id",
      "name",
      "number",
      "masterKey",
      "nostrPubkey",
      "cashEnabled",
      "ibanEnabled",
      "sparkEnabled",
      "revokedAt",
      "configVersion",
      "configHash",
      "ackedConfigHash",
      "reportedLastSeq",
      "lastSeenAt",
      "createdAt",
    ])
    .where("isDeleted", "is not", sqliteTrue)
    .where("name", "is not", null)
    .where("number", "is not", null)
    .where("masterKey", "is not", null)
    .where("nostrPubkey", "is not", null)
    .where("cashEnabled", "is not", null)
    .where("ibanEnabled", "is not", null)
    .where("sparkEnabled", "is not", null)
    .where("configVersion", "is not", null)
    .orderBy("number")
    .orderBy("id")
    .$narrowType<{
      name: KyselyNotNull
      number: KyselyNotNull
      masterKey: KyselyNotNull
      nostrPubkey: KyselyNotNull
      cashEnabled: KyselyNotNull
      ibanEnabled: KyselyNotNull
      sparkEnabled: KyselyNotNull
      configVersion: KyselyNotNull
    }>()
)

export type StationListRow = InferRow<typeof stationsQuery>

export const stationByIdQuery = (stationId: StationId) =>
  createQuery((db) =>
    db
      .selectFrom("station")
      .select([
        "id",
        "name",
        "number",
        "masterKey",
        "nostrPubkey",
        "cashEnabled",
        "ibanEnabled",
        "sparkEnabled",
        "revokedAt",
        "configVersion",
        "configHash",
        "ackedConfigHash",
        "reportedLastSeq",
        "lastSeenAt",
        "createdAt",
      ])
      .where("id", "=", stationId)
      .where("isDeleted", "is not", sqliteTrue)
      .where("name", "is not", null)
      .where("number", "is not", null)
      .where("masterKey", "is not", null)
      .where("nostrPubkey", "is not", null)
      .where("cashEnabled", "is not", null)
      .where("ibanEnabled", "is not", null)
      .where("sparkEnabled", "is not", null)
      .where("configVersion", "is not", null)
      .$narrowType<{
        name: KyselyNotNull
        number: KyselyNotNull
        masterKey: KyselyNotNull
        nostrPubkey: KyselyNotNull
        cashEnabled: KyselyNotNull
        ibanEnabled: KyselyNotNull
        sparkEnabled: KyselyNotNull
        configVersion: KyselyNotNull
      }>()
  )

/** The highest number any station has had, revoked or not. */
export const lastStationNumberQuery = createQuery((db) =>
  db
    .selectFrom("station")
    .select("number")
    .where("number", "is not", null)
    .orderBy("number", "desc")
    .limit(1)
    .$narrowType<{ number: KyselyNotNull }>()
)

/** A station's reports in seq order, for `analyzeStationReportChain`. */
export const stationReportChainQuery = (stationId: StationId) =>
  createQuery((db) =>
    db
      .selectFrom("stationReport")
      .select(["seq", "hash", "prevHash", "receivedAt"])
      .where("stationId", "=", stationId)
      .where("isDeleted", "is not", sqliteTrue)
      .where("seq", "is not", null)
      .where("hash", "is not", null)
      .where("prevHash", "is not", null)
      .where("receivedAt", "is not", null)
      .orderBy("seq")
      .orderBy("hash")
      .$narrowType<{
        seq: KyselyNotNull
        hash: KyselyNotNull
        prevHash: KyselyNotNull
        receivedAt: KyselyNotNull
      }>()
  )

/** The newest report stored for a payment, to project only the latest. */
export const latestStationReportByPaymentIdQuery = (paymentId: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("stationReport")
      .select(["id", "seq"])
      .where("paymentId", "=", paymentId)
      .where("isDeleted", "is not", sqliteTrue)
      .where("seq", "is not", null)
      .orderBy("seq", "desc")
      .limit(1)
      .$narrowType<{ seq: KyselyNotNull }>()
  )

/** The reports of a station already stored, by id. */
export const stationReportIdsQuery = (stationId: StationId) =>
  createQuery((db) =>
    db
      .selectFrom("stationReport")
      .select(["id"])
      .where("stationId", "=", stationId)
      .where("isDeleted", "is not", sqliteTrue)
  )

/**
 * Station payments the station took in `[from, to)`, with what the overview
 * needs to total them: whether the owner holds money for each, and whether
 * the station's newest report already said it was paid.
 */
export const stationPaymentsInRangeQuery = ({
  from,
  to,
}: {
  readonly from: TimestampMs
  readonly to: TimestampMs
}) =>
  createQuery((db) =>
    db
      .selectFrom("payment")
      .leftJoin("employee", "employee.id", "payment.employeeId")
      .select([
        "payment.id",
        "payment.stationId",
        "payment.employeeId",
        "employee.name as employeeName",
        "payment.amount",
        "payment.currency",
        "payment.tipAmount",
        "payment.canceledAt",
        "payment.confirmedPaidAt",
        "payment.expiresAt",
        "payment.originCreatedAt",
      ])
      .select((eb) => [
        eb
          .selectFrom("reconciliationClaim")
          .innerJoin(
            "accountTransaction",
            "accountTransaction.id",
            "reconciliationClaim.accountTransactionId"
          )
          .select((claimEb) =>
            claimEb.fn.count<number>("reconciliationClaim.id").as("count")
          )
          .whereRef("reconciliationClaim.paymentId", "=", "payment.id")
          .where("reconciliationClaim.isDeleted", "is not", sqliteTrue)
          .where("accountTransaction.isDeleted", "is not", sqliteTrue)
          .as("activeClaimCount"),
        eb
          .selectFrom("stationReport")
          .select("stationReport.stationPaid")
          .whereRef("stationReport.paymentId", "=", "payment.id")
          .where("stationReport.isDeleted", "is not", sqliteTrue)
          .orderBy("stationReport.seq", "desc")
          .limit(1)
          .as("stationPaid"),
      ])
      .where("payment.isDeleted", "is not", sqliteTrue)
      .where("payment.stationId", "is not", null)
      .where("payment.originCreatedAt", ">=", from)
      .where("payment.originCreatedAt", "<", to)
      .where("payment.amount", "is not", null)
      .where("payment.currency", "is not", null)
      .where("payment.tipAmount", "is not", null)
      .orderBy("payment.originCreatedAt")
      .$narrowType<{
        stationId: KyselyNotNull
        originCreatedAt: KyselyNotNull
        amount: KyselyNotNull
        currency: KyselyNotNull
        tipAmount: KyselyNotNull
      }>()
  )

export type StationPaymentInRangeRow = InferRow<
  ReturnType<typeof stationPaymentsInRangeQuery>
>

/**
 * Station payments the owner holds bank or Lightning money for while the
 * station's newest report does not say paid: the station is to hear it
 * settled (station/0006).
 */
export const stationSettlementNoticesQuery = createQuery((db) =>
  db
    .selectFrom("payment")
    .innerJoin("reconciliationClaim", (join) =>
      join
        .onRef("reconciliationClaim.paymentId", "=", "payment.id")
        .on("reconciliationClaim.isDeleted", "is not", sqliteTrue)
    )
    .innerJoin(
      "accountTransaction",
      "accountTransaction.id",
      "reconciliationClaim.accountTransactionId"
    )
    .leftJoin(
      "accountTransactionSpark",
      "accountTransactionSpark.id",
      "accountTransaction.id"
    )
    .select([
      "payment.id as paymentId",
      "payment.stationId",
      "accountTransaction.kind",
      "accountTransaction.occurredAt",
      "accountTransactionSpark.sparkTransferId",
    ])
    .where("payment.isDeleted", "is not", sqliteTrue)
    .where("payment.stationId", "is not", null)
    .where("accountTransaction.isDeleted", "is not", sqliteTrue)
    .where("accountTransaction.kind", "in", ["iban", "spark"])
    .where("accountTransaction.occurredAt", "is not", null)
    .where((eb) =>
      eb(
        eb
          .selectFrom("stationReport")
          .select("stationReport.stationPaid")
          .whereRef("stationReport.paymentId", "=", "payment.id")
          .where("stationReport.isDeleted", "is not", sqliteTrue)
          .orderBy("stationReport.seq", "desc")
          .limit(1),
        "=",
        0
      )
    )
    .$narrowType<{
      stationId: KyselyNotNull
      kind: KyselyNotNull
      occurredAt: KyselyNotNull
    }>()
)

// Station side

export const stationConfigQuery = createQuery((db) =>
  db
    .selectFrom("stationConfig")
    .select(["stationId", "name", "number", "version", "hash", "configJson"])
    .where("id", "=", stationConfigRowId)
    .where("isDeleted", "is not", sqliteTrue)
    .where("stationId", "is not", null)
    .where("name", "is not", null)
    .where("number", "is not", null)
    .where("version", "is not", null)
    .where("hash", "is not", null)
    .where("configJson", "is not", null)
    .$narrowType<{
      stationId: KyselyNotNull
      name: KyselyNotNull
      number: KyselyNotNull
      version: KyselyNotNull
      hash: KyselyNotNull
      configJson: KyselyNotNull
    }>()
)

/** The employee taking payments now, or no row while nobody is chosen. */
export const currentEmployeeQuery = createQuery((db) =>
  db
    .selectFrom("stationSession")
    .innerJoin("employee", "employee.id", "stationSession.employeeId")
    .select(["employee.id", "employee.name"])
    .where("stationSession.id", "=", stationSessionRowId)
    .where("stationSession.isDeleted", "is not", sqliteTrue)
    .where("employee.isDeleted", "is not", sqliteTrue)
    .where("employee.name", "is not", null)
    .$narrowType<{ name: KyselyNotNull }>()
)

/** What a station has yet to deliver, and when the owner last acked. */
export const stationOutboxStatusQuery = createQuery((db) =>
  db
    .selectFrom("stationOutbox")
    .select((eb) => [
      eb.fn
        .count<number>("stationOutbox.paymentId")
        .distinct()
        .filterWhere("stationOutbox.ackedAt", "is", null)
        .as("undeliveredPaymentCount"),
      eb.fn
        .count<number>("stationOutbox.id")
        .filterWhere("stationOutbox.ackedAt", "is", null)
        .as("undeliveredReportCount"),
      eb.fn.max("stationOutbox.ackedAt").as("lastAckedAt"),
    ])
    .where("stationOutbox.isDeleted", "is not", sqliteTrue)
)

/** The newest report in the outbox, the one the next links to. */
export const lastStationOutboxQuery = createQuery((db) =>
  db
    .selectFrom("stationOutbox")
    .select(["seq", "hash"])
    .where("isDeleted", "is not", sqliteTrue)
    .where("seq", "is not", null)
    .where("hash", "is not", null)
    .orderBy("seq", "desc")
    .limit(1)
    .$narrowType<{ seq: KyselyNotNull; hash: KyselyNotNull }>()
)

/** Reports the owner has not acknowledged, oldest first. */
export const unackedStationOutboxQuery = createQuery((db) =>
  db
    .selectFrom("stationOutbox")
    .select([
      "id",
      "seq",
      "prevHash",
      "hash",
      "paymentId",
      "payloadJson",
      "sentAt",
    ])
    .where("isDeleted", "is not", sqliteTrue)
    .where("ackedAt", "is", null)
    .where("seq", "is not", null)
    .where("prevHash", "is not", null)
    .where("hash", "is not", null)
    .where("payloadJson", "is not", null)
    .orderBy("seq")
    .$narrowType<{
      seq: KyselyNotNull
      prevHash: KyselyNotNull
      hash: KyselyNotNull
      payloadJson: KyselyNotNull
    }>()
)

/**
 * Everything a payment's report says, for the station's payments created
 * since `createdSince` or with one of `paymentIds`, with the payload last
 * reported for each so only a change is appended.
 */
export const stationPaymentSnapshotsQuery = (
  filter:
    | { readonly createdSince: DateIso }
    | { readonly paymentIds: ReadonlyArray<PaymentId> }
) =>
  createQuery((db) =>
    db
      .selectFrom("payment")
      .leftJoin("paymentNumber", (join) =>
        join
          .onRef("paymentNumber.id", "=", "payment.id")
          .on("paymentNumber.isDeleted", "is not", sqliteTrue)
      )
      .leftJoin("paymentCashRegister", (join) =>
        join
          .onRef("paymentCashRegister.id", "=", "payment.id")
          .on("paymentCashRegister.isDeleted", "is not", sqliteTrue)
      )
      .leftJoin("paymentIban", (join) =>
        join
          .onRef("paymentIban.id", "=", "payment.id")
          .on("paymentIban.isDeleted", "is not", sqliteTrue)
      )
      .leftJoin("paymentBtc", (join) =>
        join
          .onRef("paymentBtc.id", "=", "payment.id")
          .on("paymentBtc.isDeleted", "is not", sqliteTrue)
      )
      .leftJoin("paymentBtcLightning", (join) =>
        join
          .onRef("paymentBtcLightning.id", "=", "payment.id")
          .on("paymentBtcLightning.isDeleted", "is not", sqliteTrue)
      )
      .select([
        "payment.id",
        "payment.stationId",
        "payment.employeeId",
        "payment.createdAt",
        "payment.amount",
        "payment.currency",
        "payment.tipAmount",
        "payment.canceledAt",
        "payment.expiresAt",
        "paymentNumber.serialNumber",
        "paymentNumber.date as numberDate",
        "paymentCashRegister.accountId as cashAccountId",
        "paymentCashRegister.receivedAmount as cashReceivedAmount",
        "paymentIban.accountId as ibanAccountId",
        "paymentIban.variableSymbol",
        "paymentIban.specificSymbol",
        "paymentBtc.accountId as sparkAccountId",
        "paymentBtc.amountSats",
        "paymentBtc.exchangeRate",
        "paymentBtc.exchangeRateSource",
        "paymentBtc.exchangeRateFetchedAt",
        "paymentBtcLightning.lnInvoice",
        "paymentBtcLightning.lightningReceiveRequestId",
        "paymentBtcLightning.paymentHash",
      ])
      .select((eb) => [
        evoluJsonArrayFrom(
          eb
            .selectFrom("reconciliationClaim")
            .innerJoin(
              "accountTransaction",
              "accountTransaction.id",
              "reconciliationClaim.accountTransactionId"
            )
            .leftJoin(
              "accountTransactionSpark",
              "accountTransactionSpark.id",
              "accountTransaction.id"
            )
            .leftJoin(
              "accountTransactionLightning",
              "accountTransactionLightning.id",
              "accountTransaction.id"
            )
            .select([
              "accountTransaction.kind",
              "accountTransaction.amount",
              "accountTransaction.currency",
              "accountTransaction.occurredAt",
              "accountTransactionSpark.sparkTransferId",
              "accountTransactionLightning.preImage",
            ])
            .distinct()
            .whereRef("reconciliationClaim.paymentId", "=", "payment.id")
            .where("reconciliationClaim.isDeleted", "is not", sqliteTrue)
            .where("accountTransaction.isDeleted", "is not", sqliteTrue)
            .where("accountTransaction.kind", "is not", null)
            .where("accountTransaction.amount", "is not", null)
            .where("accountTransaction.currency", "is not", null)
            .where("accountTransaction.occurredAt", "is not", null)
            .$narrowType<{
              kind: KyselyNotNull
              amount: KyselyNotNull
              currency: KyselyNotNull
              occurredAt: KyselyNotNull
            }>()
        ).as("settlements"),
        eb
          .selectFrom("stationOutbox")
          .select("stationOutbox.payloadJson")
          .whereRef("stationOutbox.paymentId", "=", "payment.id")
          .where("stationOutbox.isDeleted", "is not", sqliteTrue)
          .orderBy("stationOutbox.seq", "desc")
          .limit(1)
          .as("lastReportedPayload"),
      ])
      .where("payment.isDeleted", "is not", sqliteTrue)
      .where("payment.stationId", "is not", null)
      .where("payment.amount", "is not", null)
      .where("payment.currency", "is not", null)
      .where("payment.tipAmount", "is not", null)
      .where("payment.createdAt", "is not", null)
      .where((eb) =>
        "createdSince" in filter
          ? eb("payment.createdAt", ">=", filter.createdSince)
          : eb("payment.id", "in", [...filter.paymentIds])
      )
      .orderBy("payment.createdAt")
      .orderBy("payment.id")
      .$narrowType<{
        stationId: KyselyNotNull
        amount: KyselyNotNull
        currency: KyselyNotNull
        tipAmount: KyselyNotNull
        createdAt: KyselyNotNull
      }>()
  )

export type StationPaymentSnapshotRow = InferRow<
  ReturnType<typeof stationPaymentSnapshotsQuery>
>

/**
 * Station Lightning payments still waiting for their money, created since
 * `createdSince`, for the station to ask Spark about (station/0003).
 */
export const stationLightningWatchQuery = (createdSince: DateIso) =>
  createQuery((db) =>
    db
      .selectFrom("payment")
      .innerJoin("paymentBtc", "paymentBtc.id", "payment.id")
      .innerJoin("paymentBtcLightning", "paymentBtcLightning.id", "payment.id")
      .select([
        "payment.id",
        "payment.createdAt",
        "payment.expiresAt",
        "paymentBtc.accountId",
        "paymentBtc.amountSats",
        "paymentBtcLightning.lnInvoice",
        "paymentBtcLightning.lightningReceiveRequestId",
        "paymentBtcLightning.paymentHash",
      ])
      .where("payment.isDeleted", "is not", sqliteTrue)
      .where("payment.stationId", "is not", null)
      .where("payment.canceledAt", "is", null)
      .where("payment.createdAt", ">=", createdSince)
      .where("paymentBtc.isDeleted", "is not", sqliteTrue)
      .where("paymentBtcLightning.isDeleted", "is not", sqliteTrue)
      .where("paymentBtc.accountId", "is not", null)
      .where("paymentBtc.amountSats", "is not", null)
      .where("paymentBtcLightning.lnInvoice", "is not", null)
      .where("paymentBtcLightning.lightningReceiveRequestId", "is not", null)
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom("reconciliationClaim")
              .innerJoin(
                "accountTransaction",
                "accountTransaction.id",
                "reconciliationClaim.accountTransactionId"
              )
              .select("reconciliationClaim.id")
              .whereRef("reconciliationClaim.paymentId", "=", "payment.id")
              .where("reconciliationClaim.isDeleted", "is not", sqliteTrue)
              .where("accountTransaction.isDeleted", "is not", sqliteTrue)
          )
        )
      )
      .$narrowType<{
        createdAt: KyselyNotNull
        accountId: KyselyNotNull
        amountSats: KyselyNotNull
        lnInvoice: KyselyNotNull
        lightningReceiveRequestId: KyselyNotNull
      }>()
  )

export type StationLightningWatchRow = InferRow<
  ReturnType<typeof stationLightningWatchQuery>
>
