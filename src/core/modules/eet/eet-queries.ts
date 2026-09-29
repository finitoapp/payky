import { type KyselyNotNull, sqliteTrue } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import type { DeviceId } from "@/core/modules/device/device-types.ts"
import type { EetReversalId, EetSaleId } from "@/core/modules/eet/eet-types.ts"
import { createEetSaleId, eetSettingsId } from "@/core/modules/eet/eet-utils.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"

export const eetSettingsQuery = createQuery((db) =>
  db
    .selectFrom("eetSettings")
    .leftJoin("eetCertificate", (join) =>
      join
        .onRef("eetCertificate.id", "=", "eetSettings.certificateId")
        .on("eetCertificate.isDeleted", "is not", sqliteTrue)
    )
    .select([
      "eetSettings.enabledAt",
      "eetSettings.environment",
      "eetSettings.establishmentId",
      "eetSettings.certificateId",
      "eetSettings.tipOwner",
      "eetCertificate.eic",
      "eetCertificate.description",
      "eetCertificate.validFrom",
      "eetCertificate.validTo",
      "eetCertificate.isTestCertificate",
    ])
    .where("eetSettings.id", "=", eetSettingsId)
    .where("eetSettings.isDeleted", "is not", sqliteTrue)
)

export const eetSigningCertificateQuery = createQuery((db) =>
  db
    .selectFrom("eetSettings")
    .innerJoin(
      "eetCertificate",
      "eetCertificate.id",
      "eetSettings.certificateId"
    )
    .select([
      "eetCertificate.eic",
      "eetCertificate.certificateDer",
      "eetCertificate.privateKeyPkcs8",
      "eetCertificate.isTestCertificate",
    ])
    .where("eetSettings.id", "=", eetSettingsId)
    .where("eetSettings.isDeleted", "is not", sqliteTrue)
    .where("eetCertificate.isDeleted", "is not", sqliteTrue)
    .where("eetCertificate.eic", "is not", null)
    .where("eetCertificate.certificateDer", "is not", null)
    .where("eetCertificate.privateKeyPkcs8", "is not", null)
    .$narrowType<{
      eic: KyselyNotNull
      certificateDer: KyselyNotNull
      privateKeyPkcs8: KyselyNotNull
    }>()
)

export const eetPaymentsToReportQuery = (deviceId: DeviceId) =>
  createQuery((db) =>
    db
      .selectFrom((eb) =>
        eb
          .selectFrom("payment")
          .innerJoin("eetSettings", (join) =>
            join
              .on("eetSettings.id", "=", eetSettingsId)
              .on("eetSettings.isDeleted", "is not", sqliteTrue)
          )
          .leftJoin("paymentCashRegister", (join) =>
            join
              .onRef("paymentCashRegister.id", "=", "payment.id")
              .on("paymentCashRegister.isDeleted", "is not", sqliteTrue)
          )
          .select((eb) => {
            const firstActiveClaim = eb
              .selectFrom("reconciliationClaim")
              .innerJoin(
                "accountTransaction",
                "accountTransaction.id",
                "reconciliationClaim.accountTransactionId"
              )
              .innerJoin(
                "account",
                "account.id",
                "accountTransaction.accountId"
              )
              .whereRef("reconciliationClaim.paymentId", "=", "payment.id")
              .where("reconciliationClaim.isDeleted", "is not", sqliteTrue)
              .where("accountTransaction.isDeleted", "is not", sqliteTrue)
              .where("reconciliationClaim.claimedAt", "is not", null)
              .where("account.kind", "is not", null)
              .orderBy("reconciliationClaim.claimedAt")
              .limit(1)

            return [
              "payment.id",
              "payment.billId",
              "payment.amount",
              "payment.tipAmount",
              "payment.currency",
              "paymentCashRegister.receivedAmount as cashReceivedAmount",
              "eetSettings.enabledAt",
              firstActiveClaim
                .select("reconciliationClaim.claimedAt")
                .as("firstClaimedAt"),
              firstActiveClaim.select("account.kind").as("method"),
            ]
          })
          .where("payment.deviceId", "=", deviceId)
          .where("payment.isDeleted", "is not", sqliteTrue)
          .where("payment.amount", "is not", null)
          .where("payment.tipAmount", "is not", null)
          .where("payment.currency", "is not", null)
          .where("eetSettings.enabledAt", "is not", null)
          .where((eb) =>
            eb.not(
              eb.exists(
                eb
                  .selectFrom("eetSale")
                  .select("eetSale.id")
                  .whereRef("eetSale.paymentId", "=", "payment.id")
              )
            )
          )
          .as("candidate")
      )
      .selectAll()
      .where("candidate.firstClaimedAt", "is not", null)
      .whereRef("candidate.firstClaimedAt", ">=", "candidate.enabledAt")
      .$narrowType<{
        amount: KyselyNotNull
        tipAmount: KyselyNotNull
        currency: KyselyNotNull
        enabledAt: KyselyNotNull
        firstClaimedAt: KyselyNotNull
        method: KyselyNotNull
      }>()
  )

export const eetSalesToDeliverQuery = (deviceId: DeviceId) =>
  createQuery((db) =>
    db
      .selectFrom("eetSale")
      .leftJoin("eetSaleConfirmation", (join) =>
        join
          .onRef("eetSaleConfirmation.id", "=", "eetSale.id")
          .on("eetSaleConfirmation.isDeleted", "is not", sqliteTrue)
      )
      .select(["eetSale.id", "eetSale.lastAttemptAt"])
      .where("eetSale.deviceId", "=", deviceId)
      .where("eetSale.isDeleted", "is not", sqliteTrue)
      .where("eetSale.unsupportedReason", "is", null)
      .where((eb) =>
        eb.or([
          eb("eetSale.lastAttemptResult", "is", null),
          eb("eetSale.lastAttemptResult", "=", "retry"),
        ])
      )
      .where("eetSaleConfirmation.id", "is", null)
      .orderBy("eetSale.createdAt")
  )

const eetSaleColumns = [
  "eetSale.id",
  "eetSale.paymentId",
  "eetSale.billId",
  "eetSale.deviceId",
  "eetSale.method",
  "eetSale.amount",
  "eetSale.currency",
  "eetSale.environment",
  "eetSale.eic",
  "eetSale.establishmentId",
  "eetSale.cashRegisterId",
  "eetSale.sequenceNumber",
  "eetSale.saleAt",
  "eetSale.unsupportedReason",
  "eetSale.hadUnansweredAttempt",
  "eetSale.attemptStartedAt",
  "eetSale.lastAttemptAt",
  "eetSale.lastAttemptResult",
  "eetSale.lastErrorType",
  "eetSale.lastErrorCode",
  "eetSale.lastErrorMessage",
  "eetSale.lastGlobalTransactionId",
  "eetSaleConfirmation.pok",
  "eetSaleConfirmation.receivedAt",
  "eetSaleConfirmation.isTest",
  "eetSaleConfirmation.warningsJson",
  "eetSaleConfirmation.globalTransactionId",
] as const

type EetSaleRequiredColumns = {
  paymentId: KyselyNotNull
  deviceId: KyselyNotNull
  method: KyselyNotNull
  amount: KyselyNotNull
  currency: KyselyNotNull
  environment: KyselyNotNull
  eic: KyselyNotNull
  establishmentId: KyselyNotNull
  cashRegisterId: KyselyNotNull
  sequenceNumber: KyselyNotNull
  saleAt: KyselyNotNull
}

export const eetSaleByIdQuery = (saleId: EetSaleId) =>
  createQuery((db) =>
    db
      .selectFrom("eetSale")
      .leftJoin("eetSaleConfirmation", (join) =>
        join
          .onRef("eetSaleConfirmation.id", "=", "eetSale.id")
          .on("eetSaleConfirmation.isDeleted", "is not", sqliteTrue)
      )
      .select(eetSaleColumns)
      .where("eetSale.id", "=", saleId)
      .where("eetSale.isDeleted", "is not", sqliteTrue)
      .where("eetSale.paymentId", "is not", null)
      .where("eetSale.saleAt", "is not", null)
      .$narrowType<EetSaleRequiredColumns>()
  )

export const eetSaleByPaymentIdQuery = (paymentId: PaymentId) =>
  eetSaleByIdQuery(createEetSaleId(paymentId))

export const eetSalesByBillIdQuery = (billId: BillId) =>
  createQuery((db) =>
    db
      .selectFrom("eetSale")
      .leftJoin("eetSaleConfirmation", (join) =>
        join
          .onRef("eetSaleConfirmation.id", "=", "eetSale.id")
          .on("eetSaleConfirmation.isDeleted", "is not", sqliteTrue)
      )
      .select(eetSaleColumns)
      .where("eetSale.billId", "=", billId)
      .where("eetSale.isDeleted", "is not", sqliteTrue)
      .where("eetSale.paymentId", "is not", null)
      .where("eetSale.saleAt", "is not", null)
      .$narrowType<EetSaleRequiredColumns>()
  )

export const unconfirmedEetSalesQuery = createQuery((db) =>
  db
    .selectFrom("eetSale")
    .leftJoin("eetSaleConfirmation", (join) =>
      join
        .onRef("eetSaleConfirmation.id", "=", "eetSale.id")
        .on("eetSaleConfirmation.isDeleted", "is not", sqliteTrue)
    )
    .select(eetSaleColumns)
    .where("eetSale.isDeleted", "is not", sqliteTrue)
    .where("eetSaleConfirmation.id", "is", null)
    .where("eetSale.paymentId", "is not", null)
    .where("eetSale.saleAt", "is not", null)
    .orderBy("eetSale.saleAt", "desc")
    .$narrowType<EetSaleRequiredColumns>()
)

export const eetRefundsToReverseQuery = (deviceId: DeviceId) =>
  createQuery((db) =>
    db
      .selectFrom("refund")
      .innerJoin("eetSale", "eetSale.paymentId", "refund.paymentId")
      .select([
        "refund.id",
        "refund.paymentId",
        "refund.amount",
        "refund.refundedAt",
        "eetSale.id as saleId",
      ])
      .where("refund.deviceId", "=", deviceId)
      .where("refund.isDeleted", "is not", sqliteTrue)
      .where("refund.paymentId", "is not", null)
      .where("refund.amount", "is not", null)
      .where("refund.refundedAt", "is not", null)
      .where("eetSale.isDeleted", "is not", sqliteTrue)
      .where("eetSale.unsupportedReason", "is", null)
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom("eetReversal")
              .select("eetReversal.id")
              .whereRef("eetReversal.refundId", "=", "refund.id")
          )
        )
      )
      .orderBy("refund.refundedAt")
      .$narrowType<{
        paymentId: KyselyNotNull
        amount: KyselyNotNull
        refundedAt: KyselyNotNull
      }>()
  )

export const eetReversalsBySaleIdQuery = (saleId: EetSaleId) =>
  createQuery((db) =>
    db
      .selectFrom("eetReversal")
      .select([
        "eetReversal.id",
        "eetReversal.amount",
        "eetReversal.unsupportedReason",
      ])
      .where("eetReversal.saleId", "=", saleId)
      .where("eetReversal.isDeleted", "is not", sqliteTrue)
      .where("eetReversal.amount", "is not", null)
      .$narrowType<{ amount: KyselyNotNull }>()
  )

export const eetReversalsToDeliverQuery = (deviceId: DeviceId) =>
  createQuery((db) =>
    db
      .selectFrom("eetReversal")
      .innerJoin("eetSaleConfirmation", (join) =>
        join
          .onRef("eetSaleConfirmation.id", "=", "eetReversal.saleId")
          .on("eetSaleConfirmation.isDeleted", "is not", sqliteTrue)
      )
      .leftJoin("eetReversalConfirmation", (join) =>
        join
          .onRef("eetReversalConfirmation.id", "=", "eetReversal.id")
          .on("eetReversalConfirmation.isDeleted", "is not", sqliteTrue)
      )
      .select(["eetReversal.id", "eetReversal.lastAttemptAt"])
      .where("eetReversal.deviceId", "=", deviceId)
      .where("eetReversal.isDeleted", "is not", sqliteTrue)
      .where("eetReversal.unsupportedReason", "is", null)
      .where((eb) =>
        eb.or([
          eb("eetReversal.lastAttemptResult", "is", null),
          eb("eetReversal.lastAttemptResult", "=", "retry"),
        ])
      )
      .where("eetReversalConfirmation.id", "is", null)
      .orderBy("eetReversal.createdAt")
  )

const eetReversalColumns = [
  "eetReversal.id",
  "eetReversal.refundId",
  "eetReversal.saleId",
  "eetReversal.paymentId",
  "eetReversal.deviceId",
  "eetReversal.amount",
  "eetReversal.currency",
  "eetReversal.environment",
  "eetReversal.eic",
  "eetReversal.establishmentId",
  "eetReversal.cashRegisterId",
  "eetReversal.sequenceNumber",
  "eetReversal.saleAt",
  "eetReversal.unsupportedReason",
  "eetReversal.hadUnansweredAttempt",
  "eetReversal.attemptStartedAt",
  "eetReversal.lastAttemptAt",
  "eetReversal.lastAttemptResult",
  "eetReversal.lastErrorType",
  "eetReversal.lastErrorCode",
  "eetReversal.lastErrorMessage",
  "eetReversal.lastGlobalTransactionId",
  "eetReversalConfirmation.pok",
  "eetReversalConfirmation.receivedAt",
  "eetReversalConfirmation.isTest",
  "eetReversalConfirmation.warningsJson",
  "eetReversalConfirmation.globalTransactionId",
  "eetSaleConfirmation.pok as salePok",
] as const

type EetReversalRequiredColumns = {
  refundId: KyselyNotNull
  saleId: KyselyNotNull
  paymentId: KyselyNotNull
  deviceId: KyselyNotNull
  amount: KyselyNotNull
  currency: KyselyNotNull
  environment: KyselyNotNull
  eic: KyselyNotNull
  establishmentId: KyselyNotNull
  cashRegisterId: KyselyNotNull
  sequenceNumber: KyselyNotNull
  saleAt: KyselyNotNull
}

export const eetReversalByIdQuery = (reversalId: EetReversalId) =>
  createQuery((db) =>
    db
      .selectFrom("eetReversal")
      .leftJoin("eetReversalConfirmation", (join) =>
        join
          .onRef("eetReversalConfirmation.id", "=", "eetReversal.id")
          .on("eetReversalConfirmation.isDeleted", "is not", sqliteTrue)
      )
      .leftJoin("eetSaleConfirmation", (join) =>
        join
          .onRef("eetSaleConfirmation.id", "=", "eetReversal.saleId")
          .on("eetSaleConfirmation.isDeleted", "is not", sqliteTrue)
      )
      .select(eetReversalColumns)
      .where("eetReversal.id", "=", reversalId)
      .where("eetReversal.isDeleted", "is not", sqliteTrue)
      .where("eetReversal.refundId", "is not", null)
      .where("eetReversal.saleAt", "is not", null)
      .$narrowType<EetReversalRequiredColumns>()
  )

export const eetReversalsByPaymentIdQuery = (paymentId: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("eetReversal")
      .leftJoin("eetReversalConfirmation", (join) =>
        join
          .onRef("eetReversalConfirmation.id", "=", "eetReversal.id")
          .on("eetReversalConfirmation.isDeleted", "is not", sqliteTrue)
      )
      .leftJoin("eetSaleConfirmation", (join) =>
        join
          .onRef("eetSaleConfirmation.id", "=", "eetReversal.saleId")
          .on("eetSaleConfirmation.isDeleted", "is not", sqliteTrue)
      )
      .select(eetReversalColumns)
      .where("eetReversal.paymentId", "=", paymentId)
      .where("eetReversal.isDeleted", "is not", sqliteTrue)
      .where("eetReversal.refundId", "is not", null)
      .where("eetReversal.saleAt", "is not", null)
      .$narrowType<EetReversalRequiredColumns>()
  )

export const unconfirmedEetReversalsQuery = createQuery((db) =>
  db
    .selectFrom("eetReversal")
    .leftJoin("eetReversalConfirmation", (join) =>
      join
        .onRef("eetReversalConfirmation.id", "=", "eetReversal.id")
        .on("eetReversalConfirmation.isDeleted", "is not", sqliteTrue)
    )
    .leftJoin("eetSaleConfirmation", (join) =>
      join
        .onRef("eetSaleConfirmation.id", "=", "eetReversal.saleId")
        .on("eetSaleConfirmation.isDeleted", "is not", sqliteTrue)
    )
    .select(eetReversalColumns)
    .where("eetReversalConfirmation.id", "is", null)
    .where("eetReversal.isDeleted", "is not", sqliteTrue)
    .where("eetReversal.refundId", "is not", null)
    .where("eetReversal.saleAt", "is not", null)
    .orderBy("eetReversal.saleAt", "desc")
    .$narrowType<EetReversalRequiredColumns>()
)
