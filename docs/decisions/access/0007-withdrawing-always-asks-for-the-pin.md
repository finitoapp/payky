# 0007 Withdrawing money always asks for the PIN

Status: accepted
Date: 2026-10-09

## Context

Withdrawing sends the shop's money somewhere it cannot be taken back
from. A PIN session left open, or a device set to Owner by mistake, would
let whoever holds the device do it.

## Decision

- Confirming a withdrawal, of any kind, asks for the PIN even during a PIN
  session and even on a device whose defaults include `admin`, like
  changing the PIN (access/0001).
- The prompt names what the PIN approves: the amount and where it goes, so
  the owner confirms that withdrawal and not just "a withdrawal".
- With access control off there is no PIN, and the confirmation goes
  through `admin`, which everyone has then.
- Settling an uncertain on-chain withdrawal ("The money did not leave",
  "The money left") moves no money and stays behind `admin`.

## Alternatives considered

The ordinary `admin` gate: a session started for another settings task
would cover a withdrawal too.

## Consequences

The owner types the PIN for every withdrawal.

## Enforced by

- `e2e/withdraw.spec.ts > confirming a withdrawal asks for the PIN even during a PIN session`
- `e2e/withdraw.spec.ts > an invoice expiring during PIN entry leaves the review with an error and a new estimate`
