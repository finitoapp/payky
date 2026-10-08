import type { IndexesConfig } from "@evolu/common/local-first"

import { EmployeeId } from "@/core/modules/employee/employee-types.ts"
import { PaymentId } from "@/core/modules/payment/payment-types.ts"
import { MasterKeySchema } from "@/core/modules/shared/key-derivation.ts"
import {
  type InferTable,
  NonEmptyString255Schema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  NostrPubkeyHexSchema,
  PositiveIntegerSchema,
  Sha256HexSchema,
  SqliteBoolSchema,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import {
  StationConfigId,
  StationId,
  StationOutboxId,
  StationReportId,
  StationSessionId,
} from "./station-types.ts"

/**
 * A PoS station, as its owner keeps it. Its master key is the station's own
 * entropy, which the link carries (station/0001); the owner keeps it to show
 * the link again.
 */
export const station = {
  id: StationId,
  name: NonEmptyString255Schema,
  /** 1–9999, the prefix of the specific symbol (station/0007). */
  number: PositiveIntegerSchema,
  masterKey: MasterKeySchema,
  /** Derived from `masterKey`, to find the station a message came from. */
  nostrPubkey: NostrPubkeyHexSchema,
  cashEnabled: SqliteBoolSchema,
  ibanEnabled: SqliteBoolSchema,
  sparkEnabled: SqliteBoolSchema,
  /** Set once, never cleared (station/0005). */
  revokedAt: TimestampMsSchema.nullable(),
  /** The config last sent, as a version and the hash of its JSON (station/0008). */
  configVersion: NonNegativeIntegerSchema,
  configHash: Sha256HexSchema.nullable(),
  /** The config the station last said it applies. */
  ackedConfigHash: Sha256HexSchema.nullable(),
  /** The newest report seq the station said it has, to find trailing gaps. */
  reportedLastSeq: NonNegativeIntegerSchema.nullable(),
  lastSeenAt: TimestampMsSchema.nullable(),
} as const

/**
 * Every report a station sent, as received: the owner's audit trail
 * (station/0004). Its id derives from station, seq and hash, so a report
 * received twice is one row and two reports for one seq are two.
 */
export const stationReport = {
  id: StationReportId,
  stationId: StationId,
  seq: PositiveIntegerSchema,
  hash: Sha256HexSchema,
  prevHash: Sha256HexSchema,
  paymentId: PaymentId,
  /** Whether the station had the payment settled when it reported. */
  stationPaid: SqliteBoolSchema,
  /** The payment snapshot verbatim, the exact string the hash covers. */
  payloadJson: NonEmptyStringSchema,
  receivedAt: TimestampMsSchema,
} as const

/** The config a station applies, as its owner sent it. One row. */
export const stationConfig = {
  id: StationConfigId,
  stationId: StationId,
  name: NonEmptyString255Schema,
  number: PositiveIntegerSchema,
  version: NonNegativeIntegerSchema,
  hash: Sha256HexSchema,
  configJson: NonEmptyStringSchema,
} as const

/** Who is taking payments at the station right now. One row. */
export const stationSession = {
  id: StationSessionId,
  employeeId: EmployeeId.nullable(),
} as const

/**
 * The station's reports to its owner, hash-chained and kept until the owner
 * acknowledges them (station/0004).
 */
export const stationOutbox = {
  id: StationOutboxId,
  seq: PositiveIntegerSchema,
  prevHash: Sha256HexSchema,
  hash: Sha256HexSchema,
  paymentId: PaymentId,
  payloadJson: NonEmptyStringSchema,
  /** When a relay last accepted it. */
  sentAt: TimestampMsSchema.nullable(),
  ackedAt: TimestampMsSchema.nullable(),
} as const

export const stationIndexes = ((create) => [
  create("station_nostrPubkey").on("station").column("nostrPubkey"),
  create("stationReport_stationId_seq")
    .on("stationReport")
    .columns(["stationId", "seq"]),
  create("stationReport_paymentId").on("stationReport").column("paymentId"),
  create("stationOutbox_seq").on("stationOutbox").column("seq"),
  create("stationOutbox_paymentId").on("stationOutbox").column("paymentId"),
  create("stationOutbox_ackedAt").on("stationOutbox").column("ackedAt"),
]) satisfies IndexesConfig

export type StationRow = InferTable<typeof station>
export type StationReportRow = InferTable<typeof stationReport>
export type StationConfigRow = InferTable<typeof stationConfig>
export type StationOutboxRow = InferTable<typeof stationOutbox>
