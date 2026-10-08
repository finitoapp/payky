# 0002 An account is one row per device

Status: accepted
Date: 2026-10-08

## Context

A device keeps its accounts in the device database, one `account` row
each. Adding an account looked the master key up among the live rows and
inserted a row with a random id when it found none. Two things slipped
through: an account removed in Settings → Accounts (a soft delete) came back
as a second row with a new random name instead of its own, and two adds
running at once could both find nothing and insert two rows, since nothing
in the database keeps a master key unique.

## Decision

A device account's id is derived from the account: `deriveDeviceAccountId`
hashes its app owner id, so adding the same account always writes the same
row, and concurrent adds merge into it.

Adding looks the master key up among all rows, removed ones included. A
live row is selected and keeps its name and transports, whatever the add
brought. A removed row is revived with the name and transports it had, and
counts as added, since it was not on the device. Only when there is no row
is one created, under the derived id.

The id derives from the app owner id, not the master key, because it
travels in URLs (`/restore-account?previous=`); the owner id is in sync
URLs already.

## Alternatives considered

- Migrating existing rows to derived ids: the lookup by master key could
  then go, but `createdAt` is a system column a migration cannot carry over,
  so every existing account would show the migration as its creation date,
  and the device database has no migration runner yet. Rows stored before
  this decision keep their random ids and are found by master key.
- Reviving without deriving ids: fixes the removed-account case, but leaves
  concurrent adds to whatever the UI happens to prevent.

## Consequences

- Rows from before this decision keep their random ids, so the lookup by
  master key stays, and a device that already holds duplicates keeps them;
  adding selects the live, most recently used one.
- Removing an account and adding it back restores its old name rather than
  the one the restore or transfer offered.

## Enforced by

- `src/core/evolu/device-account.test.ts > deriveDeviceAccountId > is the same for a master key every time, and differs between keys`
- `src/core/evolu/device-account.test.ts > createOrSelectAccount > adding the same account twice at once writes one row`
- `src/core/evolu/device-account.test.ts > createOrSelectAccount > re-adding a removed account revives its row, name and transports`
- `src/core/evolu/device-account.test.ts > createOrSelectAccount > selecting an existing account leaves its name and transports alone`
- `src/core/evolu/device-account.test.ts > createOrSelectAccount > an account stored under a random id from before is selected, not duplicated`
