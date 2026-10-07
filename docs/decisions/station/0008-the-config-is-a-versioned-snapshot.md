# 0008 The config is a versioned snapshot

Status: accepted
Date: 2026-10-07

## Context

A station needs the owner's currency, tips, payment methods, accounts and
employees, and has no access to the owner's database. Messages can arrive
late, twice or out of order, and the owner may run on more than one device.

## Decision

The owner builds the whole config, hashes its JSON and bumps the station's
config version whenever the hash changes. It sends the config until the
station reports applying that hash. The station applies a config only when
its version is higher than the applied one, or equal with a greater hash,
and only when its JSON matches the hash. It applies all of it in one batch.

## Alternatives considered

Syncing each setting as its own message: a station could run on half of a
change.

## Consequences

Any owner change resends the whole config to every station, which is small.
The version lives in the owner's Evolu, not its clock.

## Enforced by

- `src/core/modules/station/station-config-actions.test.ts > applyStationConfig > keeps the newer config and drops the employee the owner removed`
- `src/core/modules/station/station-config-actions.test.ts > applyStationConfig > refuses a config whose JSON is not what its hash names`
- `src/core/modules/station/station-config-utils.test.ts > isNewerStationConfig > takes a higher version, or the greater hash of the same version`
- `src/core/modules/station/station-config-utils.test.ts > buildStationConfig > hashes the same inputs the same, whatever order employees come in`
- `src/core/background-jobs/jobs/owner-station-job.test.ts > owner station job > sends a new station its config`
