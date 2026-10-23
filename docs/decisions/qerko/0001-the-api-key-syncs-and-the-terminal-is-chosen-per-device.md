# 0001 The API key syncs with the account and the terminal is chosen per device

Status: accepted
Date: 2026-10-23

## Context

Qerko pairs a company with an API key by e-mailing a code to the company. The
key lets a device start payments on any terminal of that company, and each
counter has its own terminal. The key belongs to the Qerko environment it was
issued in: a sandbox key is useless in production, and a merchant needs the
sandbox only to try the connection.

## Decision

The key is saved in the synced `qerkoPlugin` singleton, next to the
environment it was issued in, so every device of the account can take a
payment once one device paired. Which terminal a device pays on is saved in
the device database (`qerkoTerminalSelection`) and never syncs. The pairing
wizard offers the environment under "Additional options", production by
default; it cannot be changed afterwards without pairing again.

## Alternatives considered

Pairing on every device, which makes the owner enter a code per device for a
key the account already has. Syncing the terminal choice, which would put two
counters on one terminal after the second device synced.

## Consequences

The key is stored in plain text in the synced database, as the Fio token is.
Unpairing deletes the plugin, switches the payment method off on every device
and forgets this device's terminal; other devices keep a terminal choice that
no longer has a key behind it until they choose again.

## Enforced by

- `packages/core/src/modules/qerko-plugin/qerko-plugin-actions.test.ts > completeQerkoPairing > saves the key with its environment and the legal entity`
- `packages/core/src/modules/qerko-plugin/qerko-plugin-actions.test.ts > completeQerkoPairing > unpairing removes the pairing`
- `packages/core/src/evolu/device-qerko.test.ts > qerko terminal selection > remembers one terminal per account and replaces it`
- `apps/web-app/e2e/qerko-terminal.spec.ts > pair with Qerko: the wizard asks for the code and a terminal, and the method turns on`
