import { describe, expect, test } from "vitest"

import {
  describeQerkoPairingFailure,
  describeQerkoPaymentError,
  describeQerkoTerminalStatus,
  describeQerkoTerminalsFailure,
  isQerkoCodeComplete,
  isQerkoStepCancellable,
  parseQerkoIdentificationNumber,
  selectableQerkoLocations,
} from "./qerko-terminal-flow.ts"

describe("parseQerkoIdentificationNumber", () => {
  test("drops the spaces a company id is grouped by", () => {
    expect(parseQerkoIdentificationNumber(" 123 456 78 ")).toBe("12345678")
  })

  test.each(["", "   "])("reads %j as not entered", (input) => {
    expect(parseQerkoIdentificationNumber(input)).toBeNull()
  })
})

describe("isQerkoCodeComplete", () => {
  test("wants exactly four digits", () => {
    expect(isQerkoCodeComplete("1234")).toBe(true)
    expect(isQerkoCodeComplete("123")).toBe(false)
    expect(isQerkoCodeComplete("12345")).toBe(false)
    expect(isQerkoCodeComplete("12a4")).toBe(false)
  })
})

describe("describeQerkoPairingFailure", () => {
  test("a wrong code keeps the code step and counts the attempts left", () => {
    expect(
      describeQerkoPairingFailure({
        type: "QerkoPairingInvalidCode",
        remainingAttempts: 2,
      })
    ).toEqual({
      key: "settings.qerkoTerminal.code.invalid",
      attemptsLeft: 2,
      restart: false,
    })
  })

  test.each([
    ["QerkoPairingCodeExpired", "settings.qerkoTerminal.code.expired"],
    [
      "QerkoPairingMaxAttemptsReached",
      "settings.qerkoTerminal.code.maxAttempts",
    ],
  ])("%s sends the wizard back to the first step", (type, key) => {
    expect(describeQerkoPairingFailure({ type })).toEqual({
      key,
      attemptsLeft: null,
      restart: true,
    })
  })

  test("anything else is a connection problem and keeps the code step", () => {
    expect(describeQerkoPairingFailure({ type: "FetchError" })).toEqual({
      key: "settings.qerkoTerminal.error.unreachable",
      attemptsLeft: null,
      restart: false,
    })
  })
})

describe("selectableQerkoLocations", () => {
  test("keeps only activated terminals and the locations that have one", () => {
    const terminal = (id: string, enabled: boolean) => ({
      id,
      tid: `tid-${id}`,
      enabled,
      platform: "physical" as const,
    })

    expect(
      selectableQerkoLocations({
        legalEntity: {
          name: "Cafe",
          identificationNumber: "1",
          country: "CZ",
        },
        locations: [
          {
            id: "l1",
            name: "Main",
            terminals: [terminal("a", true), terminal("b", false)],
          },
          { id: "l2", name: "Closed", terminals: [terminal("c", false)] },
        ],
      })
    ).toEqual([
      {
        locationId: "l1",
        locationName: "Main",
        terminals: [
          {
            terminalId: "a",
            tid: "tid-a",
            locationName: "Main",
            platform: "physical",
          },
        ],
      },
    ])
  })
})

describe("describeQerkoTerminalStatus", () => {
  test("a connected terminal is fine", () => {
    expect(
      describeQerkoTerminalStatus({
        type: "status",
        authorizationServerConnection: "ok",
      })
    ).toEqual({ key: "settings.qerkoTerminal.test.connected", ok: true })
  })

  test("a terminal that cannot reach the processor is not", () => {
    expect(
      describeQerkoTerminalStatus({
        type: "status",
        authorizationServerConnection: "error",
      })
    ).toEqual({ key: "settings.qerkoTerminal.test.bankUnreachable", ok: false })
  })

  test("any other answer names the problem", () => {
    expect(describeQerkoTerminalStatus({ type: "terminalBusy" })).toEqual({
      key: "settings.qerkoTerminal.test.busy",
      ok: false,
    })
  })
})

describe("describeQerkoPaymentError", () => {
  test("a refusal to start names its reason", () => {
    expect(
      describeQerkoPaymentError({
        type: "QerkoTerminalNotStarted",
        reason: "terminalNotConnected",
      })
    ).toBe("paymentWait.qerko.notStarted.notConnected")
  })

  test("a decline never reads like a connection problem", () => {
    expect(
      describeQerkoPaymentError({
        type: "QerkoTerminalPaymentFailed",
        reason: "declined",
      })
    ).toBe("paymentWait.qerko.failed.declined")
  })

  test("a dropped connection and an unknown error each have a message", () => {
    expect(describeQerkoPaymentError({ type: "FetchError" })).toBe(
      "paymentWait.qerko.error.unreachable"
    )
    expect(describeQerkoPaymentError({ type: "SomethingNew" })).toBe(
      "paymentWait.qerko.error.generic"
    )
  })
})

describe("isQerkoStepCancellable", () => {
  test("is false once the card is being authorized", () => {
    expect(isQerkoStepCancellable("waitingForCard")).toBe(true)
    expect(isQerkoStepCancellable("authorizing")).toBe(false)
    expect(isQerkoStepCancellable("finishing")).toBe(false)
  })
})

describe("describeQerkoTerminalsFailure", () => {
  test("a key Qerko refuses needs a new pairing", () => {
    for (const status of [401, 403]) {
      expect(
        describeQerkoTerminalsFailure({ type: "QerkoHttpError", status })
      ).toEqual({
        key: "settings.qerkoTerminal.terminals.keyRejected",
        keyRejected: true,
      })
    }
  })

  test("a server error or no connection is worth another try", () => {
    expect(
      describeQerkoTerminalsFailure({ type: "QerkoHttpError", status: 503 })
        .keyRejected
    ).toBe(false)
    expect(describeQerkoTerminalsFailure({ type: "FetchError" })).toEqual({
      key: "settings.qerkoTerminal.terminals.failed",
      keyRejected: false,
    })
  })
})
