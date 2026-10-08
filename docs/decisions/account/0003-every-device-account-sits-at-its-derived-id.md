# 0003 Every device account sits at its derived id

Status: accepted
Date: 2026-10-08

## Context

account/0002 gave new device accounts an id derived from the account, but
left rows from before at their random ids, found by master key. That kept
two ways to find an account, and a device that already held duplicates of
one account kept them. The device database had no migrations then; it has
them now (`deviceMigrations`, run before the active account is read).

## Decision

Every device account sits at `deriveDeviceAccountId`, a hash of its app
owner id, so adding the same account always writes the same row, and
concurrent adds merge into it. The id derives from the owner id, not the
master key, because it travels in URLs (`/restore-account?previous=`); the
owner id is in sync URLs already.

`deviceAccountDerivedIdMigration` moves the rows from before onto their
derived ids. Per account, the most recently used live row gives the name and
transports and the latest last use, so the active account stays active;
duplicates collapse into one row, and the old rows are removed. An account
whose rows were all removed moves as a removed row.

Adding an account then looks up only its derived id, removed rows included.
A live row is selected and keeps its name and transports, whatever the add
brought. A removed row is revived with the name and transports it had, and
counts as added, since it was not on the device.

## Alternatives considered

- Keeping rows from before at random ids, found by master key (account/0002):
  two lookups forever, and duplicates stay.
- Carrying `createdAt` over: it is a system column only Evolu writes.

## Consequences

- A migrated account shows the migration as its creation date. The derived
  rows are written oldest first, so the account list keeps its order.
- Removing an account and adding it back restores its old name rather than
  the one the restore or transfer offered.
- Every existing install sees the migration dialog once.

## Enforced by

- `src/core/evolu/device-account.test.ts > deriveDeviceAccountId > is the same for a master key every time, and differs between keys`
- `src/core/evolu/device-account.test.ts > createOrSelectAccount > adding the same account twice at once writes one row`
- `src/core/evolu/device-account.test.ts > createOrSelectAccount > re-adding a removed account revives its row, name and transports`
- `src/core/evolu/device-account.test.ts > createOrSelectAccount > selecting an existing account leaves its name and transports alone`
- `src/core/migrations/device-account-derived-id-migration.test.ts > device account derived id migration > moves an account onto its derived id with its name, transports and last use`
- `src/core/migrations/device-account-derived-id-migration.test.ts > device account derived id migration > collapses duplicates of one account into one, named after the most recently used`
- `src/core/migrations/device-account-derived-id-migration.test.ts > device account derived id migration > a removed account moves as a removed row, and re-adding it revives its name`
- `src/core/migrations/device-account-derived-id-migration.test.ts > device account derived id migration > is reached through the device registry`
