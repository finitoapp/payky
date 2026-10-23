import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import {
  type QerkoCountry,
  QerkoCountrySchema,
  type QerkoEnvironment,
  type QerkoTerminalStatus,
  type QerkoTerminals,
} from "@payky/core/integrations/qerko/qerko-client"
import type {
  QerkoPairingCodeExpiredError,
  QerkoPairingInvalidCodeError,
  QerkoPairingMaxAttemptsReachedError,
} from "@payky/core/modules/qerko-plugin/qerko-plugin-actions"

/**
 * What the Qerko pairing wizard and settings screens share between web and
 * native: the choices they offer, the checks on what the merchant types, and
 * how each outcome reads (qerko/0001).
 */

/** What Qerko can pair with, in the order the wizard lists them. */
export const qerkoCountryOptions = QerkoCountrySchema.options

export const qerkoCountryLabelKeys = {
  CZ: "country.cz",
  SK: "country.sk",
  DE: "country.de",
  AT: "country.at",
  HU: "country.hu",
} satisfies Record<QerkoCountry, TranslationKey>

export const qerkoEnvironmentLabelKeys = {
  production: "settings.qerkoTerminal.environment.production",
  sandbox: "settings.qerkoTerminal.environment.sandbox",
} satisfies Record<QerkoEnvironment, TranslationKey>

export const defaultQerkoCountry: QerkoCountry = "CZ"

/** Production unless the merchant opens "Additional options" and picks the sandbox. */
export const defaultQerkoEnvironment: QerkoEnvironment = "production"

/** The name the pairing's API key gets in Qerko's list of keys. */
export const QERKO_API_KEY_NAME = "Payky"

export const QERKO_CODE_LENGTH = 4

export const isQerkoCodeComplete = (code: string): boolean =>
  new RegExp(`^\\d{${QERKO_CODE_LENGTH}}$`, "u").test(code)

/** The company id as typed, without the spaces people group it by; `null` when blank. */
export const parseQerkoIdentificationNumber = (
  input: string
): string | null => {
  const compact = input.replaceAll(/\s+/gu, "")
  return compact === "" || compact.length > 255 ? null : compact
}

type QerkoPairingRefusal =
  | QerkoPairingInvalidCodeError
  | QerkoPairingCodeExpiredError
  | QerkoPairingMaxAttemptsReachedError

const qerkoPairingRefusalKeys = {
  QerkoPairingInvalidCode: "settings.qerkoTerminal.code.invalid",
  QerkoPairingCodeExpired: "settings.qerkoTerminal.code.expired",
  QerkoPairingMaxAttemptsReached: "settings.qerkoTerminal.code.maxAttempts",
} satisfies Record<QerkoPairingRefusal["type"], TranslationKey>

export interface QerkoPairingFailure {
  readonly key: TranslationKey
  /** Attempts left, for the wrong-code message. */
  readonly attemptsLeft: number | null
  /** The code cannot be tried again: the wizard goes back to its first step. */
  readonly restart: boolean
}

/**
 * How a failed pairing reads: the three answers Qerko gives about the code,
 * or, for anything else (offline, Qerko down), one generic message that
 * keeps the code step.
 */
export const describeQerkoPairingFailure = (error: {
  readonly type: string
  readonly remainingAttempts?: number
}): QerkoPairingFailure => {
  if (error.type in qerkoPairingRefusalKeys) {
    const type = error.type as QerkoPairingRefusal["type"]
    return {
      key: qerkoPairingRefusalKeys[type],
      attemptsLeft:
        type === "QerkoPairingInvalidCode"
          ? (error.remainingAttempts ?? 0)
          : null,
      restart: type !== "QerkoPairingInvalidCode",
    }
  }
  return {
    key: "settings.qerkoTerminal.error.unreachable",
    attemptsLeft: null,
    restart: false,
  }
}

export interface QerkoTerminalChoice {
  readonly terminalId: string
  readonly tid: string
  readonly locationName: string
  readonly platform: "physical" | "softPos"
}

export interface QerkoLocationChoices {
  readonly locationId: string
  readonly locationName: string
  readonly terminals: ReadonlyArray<QerkoTerminalChoice>
}

/** Locations that have a terminal to pay on: only activated ones count. */
export const selectableQerkoLocations = (
  terminals: QerkoTerminals
): ReadonlyArray<QerkoLocationChoices> =>
  terminals.locations.flatMap((location) => {
    const enabled = location.terminals.filter(({ enabled }) => enabled)
    return enabled.length === 0
      ? []
      : [
          {
            locationId: location.id,
            locationName: location.name,
            terminals: enabled.map((terminal) => ({
              terminalId: terminal.id,
              tid: terminal.tid,
              locationName: location.name,
              platform: terminal.platform,
            })),
          },
        ]
  })

const qerkoTerminalStatusKeys = {
  status: "settings.qerkoTerminal.test.connected",
  terminalBusy: "settings.qerkoTerminal.test.busy",
  terminalNotActivated: "settings.qerkoTerminal.test.notActivated",
  terminalNotConnected: "settings.qerkoTerminal.test.notConnected",
  unknownTerminal: "settings.qerkoTerminal.test.unknownTerminal",
  upstreamError: "settings.qerkoTerminal.test.upstreamError",
  upstreamTimeout: "settings.qerkoTerminal.test.upstreamTimeout",
} satisfies Record<QerkoTerminalStatus["type"], TranslationKey>

/** What "Test connection" tells the merchant about the terminal. */
export const describeQerkoTerminalStatus = (
  status: QerkoTerminalStatus
): { readonly key: TranslationKey; readonly ok: boolean } =>
  status.type === "status"
    ? status.authorizationServerConnection === "error"
      ? { key: "settings.qerkoTerminal.test.bankUnreachable", ok: false }
      : { key: qerkoTerminalStatusKeys.status, ok: true }
    : { key: qerkoTerminalStatusKeys[status.type], ok: false }
