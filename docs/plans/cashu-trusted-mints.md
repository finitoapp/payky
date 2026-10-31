# Plan: trusted Cashu mints and one default

## Context

The mints screen (`/settings/payment-accounts/cashu/mints`) shows two lists today (`cashu/0016`):

- **"Your mints"** are the *known* mints: the payment mint, the mints added by hand (`cashuMint`) and every mint any proof or operation names (`cashuKnownMintsQuery`).
- **"Suggested mints"** are `PRODUCTION_MINTS`, a constant in `cashu-utils.ts`, minus the known ones.

Trust is a separate, single rule (`cashu/0011`): Payky receives a token only from the **payment mint**, which lives in the app database as `accountCashu.mintUrl` (`cashu/0013`). Adding a mint changes nothing about trust. An added mint only holds a balance and can be moved from or withdrawn from.

This has several costs:

- "Your mints" mixes mints the merchant chose with mints that only appear in the history. Being listed there says nothing about trust, yet it reads as if it did.
- A mint named by any proof or operation, even spent or failed, stays listed for good. "Remove" only tombstones the `cashuMint` row, so a mint that was ever used cannot leave the list.
- A customer whose ecash sits at another mint the merchant would accept cannot pay with a token. The NUT-18 request names one mint, and a token from any other mint is refused as `untrustedMint`.
- A suggested mint can be made the payment mint straight from its detail page without ever being added.
- The payment mint (app database) and the added mints (Cashu database) live in two databases. No invariant between them can be written in one batch.

`cashu/0011` considered a list of trusted mints and rejected it only because Linky would not read it. With Payky's own wallet (`cashu/0012`), that reason no longer holds.

Goal: the merchant keeps a **list of trusted mints** and **one of them is the default**, both in one table of the Cashu database. Trust decides what Payky accepts. The default decides where new payments are quoted.

## Owner's decisions (2026-10-28)

| # | Question | Decision |
| --- | --- | --- |
| D1 | Where the default lives | A timestamp on the `cashuMint` row, `defaultedAt`. The default is the trusted row with the newest one. `accountCashu.mintUrl` goes. |
| D2 | Mints in the NUT-18 request | The trusted mints, the default first, **capped** so the QR stays readable. |
| D3 | Untrusting a mint with a balance | Allowed. The money stays, and the mint moves to "Other mints with a balance". |
| D4 | A token received at a trusted mint that is not the default | The money stays at that mint. There is no automatic move; the manual "move funds" remains. |
| D5 | Tapping a suggested mint | It opens the mint's detail with a "Trust" button. Nothing is trusted on one tap. |

## Target model

### The `cashuMint` table

```ts
/** A mint the merchant trusts; a tombstone is a mint no longer trusted. */
export const cashuMint = {
  id: CashuMintId,          // cashuMintIdFor(mintUrl), as now
  mintUrl: MintUrlSchema,
  /** When the mint was last chosen as the default; null if never. */
  defaultedAt: TimestampMsSchema.nullable(),
} as const
```

- **Trusted mints**: the rows that are not deleted.
- **The default**: the trusted row with the greatest `defaultedAt`. A tie goes to the smaller `mintUrl`, so every device picks the same one.
- **Mint with a balance**: a mint with `cashuProof` rows that are not spent. That is neither trust nor default.
- **Suggested mint**: the `PRODUCTION_MINTS` constant, a way to reach a well-known mint's detail and trust it.

### Why a timestamp, not a flag

Evolu merges cell by cell, and the last write wins.

- **A boolean `isDefault`**: two devices that each pick a different mint offline write two different rows. Both stay `true`, so there are two defaults.
- **A timestamp**: the newest one wins on every device, and no second write is needed to clear the old default.

The default and trust also share one row:

- **"The default is trusted" holds by construction.** A tombstoned row is not a candidate.
- **A concurrent untrust and "use for payments" on the same mint** write different cells (`isDeleted` and `defaultedAt`), and both survive. The mint ends up untrusted, and the previous default takes over.
- **Untrusting the default needs no second write** to pick a successor: the next newest `defaultedAt` among the trusted rows is it.

### Rules

1. **Choosing the default** writes `defaultedAt = max(now, newest defaultedAt among all rows + 1)`. A new choice is later than everything the device knows, even when another device's clock runs ahead and wrote a timestamp in the future. Only a trusted mint can be chosen. The detail page of a mint not trusted offers "Trust" first.
2. **Enabling Cashu** writes the `MAIN_MINT_URL` row with `defaultedAt` when the Cashu database holds no trusted row with a `defaultedAt` yet. This upsert runs in the same Task as `saveCashuAccount` but in the Cashu database, so it is a second batch. Each batch is idempotent on its own, so a crash between the two leaves nothing that the next enable does not repair.
3. **No default** can still occur: Cashu was never enabled on this database, or every row with a `defaultedAt` was untrusted concurrently. The default then falls back to the newest trusted row by `createdAt`, and finally to `MAIN_MINT_URL` when no row is trusted at all. The fallback is read-only. Payment preparation writes it as the real default (rule 1) before quoting.
4. **Receiving**: a token is received when its mint is trusted *at the moment it is processed*. Otherwise the arrival state stays `untrustedMint`, as today. The NUT-18 payload / bare-token matching of `cashu/0006` and `cashu/0011` is unchanged. A token received at a trusted mint that is not the default leaves its money there (D4).
5. **Untrusting** tombstones the row:
   - It is **allowed with a balance** (D3). The proofs stay, and the mint shows under "Other mints with a balance", from where it can be moved or withdrawn.
   - Untrusting the default is allowed only while another mint is trusted. The next newest `defaultedAt` takes over, and the screen says which. Untrusting the last trusted mint is refused.
   - Trusting the mint again clears the tombstone and keeps the old `defaultedAt`, which is harmless: a later choice is always newer.
6. **The NUT-18 request** lists the trusted mints, the default first, then the others by `defaultedAt` descending (never-default rows last, by `mintUrl`). It is **capped at `NUT18_MAX_MINTS` = 3** (D2).
   - The cap is a constant in `cashu-payment-request.ts`. Phase 3 checks the QR at 3 mints with long URLs on the smallest supported screen, and lowers the cap if it does not scan.
   - The Lightning leg stays at the payment's own mint (`paymentCashu.mintUrl`).
   - The QR is rebuilt from current data, as `cashu/0006` already says, so a change of trust shows on the next render.
   - Rule 4 is checked against all trusted mints, not only the ones the QR listed.
7. **Topups, claims, moves and withdrawals are unchanged.**
   - A topup still matches by quote id at the payment's mint (`paymentCashu.mintUrl`, a snapshot taken when the payment was prepared).
   - "Move funds" targets the default.
   - Melts and withdrawals spend from any mint with a balance, trusted or not.

### The mints screen

Three sections, each hidden when empty:

1. **Trusted mints**: the default first with its "Payments" badge, then the rest, each with its balance.
2. **Other mints with a balance**: mints whose balance is > 0 that are not trusted. Typically a mint untrusted with money still on it.
3. **Suggested mints**: `PRODUCTION_MINTS` minus the two sections above. A tap opens the detail (D5).

A mint named only by spent proofs or finished operations is **not listed** any more. Its detail page stays reachable from the history entries that name it.

Detail page actions by state:

| State | Actions |
| --- | --- |
| Default | (badge) · Untrust (only while another mint is trusted; says which mint becomes the default) |
| Trusted, not default | Use for payments · Untrust · move funds to the default |
| Not trusted, with balance | Trust · move funds to the default · withdraw |
| Not trusted, no balance (suggestion or typed URL) | Trust |

"Add a mint" keeps its check that the mint loads and lists no other mint's keyset. The result is a trusted mint. The same check runs behind "Trust" on the detail page.

## Data and code changes

### Core (`packages/core/src`)

- `modules/cashu/cashu.ts`:
  - `cashuMint` gets `defaultedAt`;
  - the doc comment says what a row and a tombstone mean;
  - an index on `(isDeleted, defaultedAt)` if the default query needs it.
- `modules/cashu/cashu-queries.ts`:
  - `cashuTrustedMintsQuery`: the rows that are not deleted, with `defaultedAt` and `createdAt`, ordered so that the first row is the default (rule 1 order, rule 3 fallback).
  - `cashuNewestDefaultedAtQuery`: the greatest `defaultedAt` over all rows, deleted ones included, for rule 1.
  - The balance per mint: the existing `cashuBalancesQuery`.
  - `cashuKnownMintsQuery` goes. Its `union` over proofs and operations is what keeps a used mint listed for good.
  - `cashuMintInUseQuery` goes unless withdraw/move still use it. Untrusting no longer does.
- `modules/cashu/cashu-utils.ts`:
  - `pickDefaultCashuMint(rows)`: rules 1 and 3 as one pure function.
  - `orderCashuRequestMints(rows, max)`: rule 6.
  - `nextDefaultedAt(now, newest)`: `max(now, newest + 1)`.
- `modules/cashu/cashu-mint-actions.ts`:
  - `addCashuMint` → `trustCashuMint(text | MintUrl)`. It keeps the load and foreign-keyset check and upserts `isDeleted: false`, leaving `defaultedAt` alone.
  - `removeCashuMint` → `untrustCashuMint(mint)`:
    - it drops the balance check;
    - it refuses the last trusted mint with `CashuLastTrustedMintError` (new, in `cashu-errors.ts`);
    - it returns the default that takes over, so the UI can name it.
  - `setCashuPaymentMint(mint)` → `setDefaultCashuMint(mint)`:
    - it refuses a mint that is not trusted (`CashuMintNotTrustedError`);
    - it writes `defaultedAt` by rule 1;
    - it needs `CashuEvoluDep & DateDep` and no longer the app database.
  - `seedDefaultCashuMint`: rule 2, called by `saveCashuAccount` on enable.
- `modules/account/`:
  - `accountCashu.mintUrl` goes (`account.ts`), along with its column in `cashuAccountQuery` and `activeCashuAccountByIdQuery` (`account-queries.ts`) and the `cashu` branch of `updateAccount` (`account-actions.ts`);
  - `saveCashuAccount` calls `seedDefaultCashuMint` and so needs `CashuEvoluDep`;
  - Cashu is in no release yet, so no migration is needed. The column simply leaves the schema, as the Linky tables did (`cashu/0012`).
- `modules/payment/payment-preparation-actions.ts`: `prepareCashuPaymentMethod` reads the default from the Cashu database (`cashuTrustedMintsQuery` + `pickDefaultCashuMint`) instead of the account. It already writes the topup there.
- `background-jobs/jobs/cashu-token-listener.ts`: the check at `token.mint !== account.mintUrl` becomes "not among the trusted mints" (`cashuTrustedMintsQuery`, `cashuEvolu`).
- `cashu/cashu-payment-request.ts`:
  - `buildCashuPaymentUri` takes `mintUrls: ReadonlyArray<string>` (already ordered and capped) instead of `mintUrl`;
  - `NUT18_MAX_MINTS` lives here;
  - `encodeNostrPaymentRequest` already takes a list.
- `demo-data/demo-data-generator.ts`: the demo account seeds its default through `seedDefaultCashuMint`.
- `testing/cashu.ts`: the test kit's Cashu account gets a trusted default row.

### Web (`apps/web-app/src`)

- `features/shared/cashu/use-cashu-wallet.ts`:
  - returns `{ defaultMint, trustedMints, balances }`; `paymentMint` and `knownMints` go;
  - everything is read from the Cashu database, the app database is no longer read.
- `features/settings/cashu/cashu-mints-page.tsx`: the three sections above.
- `features/settings/cashu/cashu-mint-detail-page.tsx`: the actions by state, with the untrust confirmation naming the next default.
- `features/settings/cashu/cashu-mint-new-page.tsx`: calls `trustCashuMint`. The copy stays "Add a mint".
- `features/payment-wait/payment-wait-page.tsx`:
  - passes `orderCashuRequestMints(trusted, NUT18_MAX_MINTS)` to `buildCashuPaymentUri`;
  - the list is read through `useCashuEvoluQuery` under the `CatchBoundary` the Cashu tab already has, so a Cashu database that fails to open still shows the Lightning leg;
  - until the list loads, the request names the payment's mint only.
- `features/settings/payment-accounts/…` / Cashu account page: the "default mint" line reads `defaultMint`.

### Native (`apps/native-app/src`)

- The same changes in:
  - `features/settings/payment-accounts/cashu-mints-page.tsx`,
  - `cashu-mint-detail-page.tsx`,
  - `cashu-mint-new-page.tsx`,
  - `cashu-account-settings-page.tsx`,
  - `features/shared/cashu/use-cashu-wallet.ts`,
  - `features/payment-wait/payment-wait-page.tsx`.
- `cashu-mints-page-model.ts`: `getCashuMintSections(trustedRows, balances)` returns `{ trusted, withBalance, suggested }`, with its test.
- `ui-parity-map.ts` if a file name changes; `features/preview/cashu-card.tsx` already passes `mintUrls`.

### i18n (`packages/app-shared/src/i18n/{en,cs,sk}/settings.ts`, `payment.ts`)

- `settings.cashuMints.known` → `settings.cashuMints.trusted` ("Trusted mints" / "Důvěryhodné minty" / "Dôveryhodné minty").
- New:
  - `settings.cashuMints.withBalance` ("Other mints with a balance"),
  - `settings.cashuMints.trust`,
  - `settings.cashuMints.untrust`,
  - `settings.cashuMints.untrustConfirm` (names the next default),
  - `settings.cashuMints.untrustError.last`,
  - `settings.cashuMints.setDefaultError.untrusted`,
  - a line on the detail page that says what trust means ("Payky accepts tokens from this mint").
- Gone:
  - `settings.cashuMints.remove`,
  - `settings.cashuMints.removeError.inUse`,
  - `settings.cashuMints.empty`; rule 3 always yields a default, so the trusted section is never empty.
- `paymentWait.cashu.arrival.untrustedMint`: "from a mint you do not trust", not "from another mint".
- `settings.cashuAccount.defaultMint` stays; only its source changes.

## Decision records (`docs/decisions/cashu/`)

| New | Content | Supersedes |
| --- | --- | --- |
| `0017` | Trusted mints: a `cashuMint` row is a trusted mint; Payky receives tokens from any trusted mint, and the money stays there (D4); the NUT-18 request lists the trusted mints, the default first, capped at `NUT18_MAX_MINTS` (D2) | `0011`; restates the "payment's mint only" bullet of `0006` |
| `0018` | The default mint is the trusted `cashuMint` row with the newest `defaultedAt`: rules 1–3, the tie-break, the fallback, the seed on enable | `0013` |
| `0019` | Mint management: three sections; trust and untrust; untrusting is allowed with a balance (D3) and refused for the last trusted mint; only a trusted mint becomes the default; a suggestion opens the detail (D5); a mint named only by history is not listed | `0016` (restates the add check and the move rules, which stay) |

`0006` keeps its status. Its first bullet's "the payment's mint only" gets a pointer to `0017`, as it already points at `0011`.

## Tests

Core:

- `cashu-utils.test.ts`:
  - `pickDefaultCashuMint`: the newest `defaultedAt` wins, a tie goes to the smaller URL, a deleted row never wins, the fallback by `createdAt`, then `MAIN_MINT_URL`;
  - `nextDefaultedAt` beats a timestamp from the future;
  - `orderCashuRequestMints`: the default first, then the order of rule 6, the cap respected.
- `cashu-mint-actions.test.ts`:
  - trust adds without changing the default;
  - untrusting with a balance succeeds and keeps the proofs;
  - untrusting the default hands it to the previous one and returns it;
  - untrusting the last trusted mint is refused;
  - `setDefaultCashuMint` refuses an untrusted mint;
  - enabling Cashu seeds `MAIN_MINT_URL` once, and a second enable keeps the merchant's choice;
  - a mint named only by spent proofs is neither trusted nor listed.
- A two-device test on the existing relay helper (`testing/evolu-relay.ts`):
  - two devices choose different defaults offline and agree on the newer one after sync;
  - one device untrusts mint X while the other makes X the default: after sync X is untrusted and the previous default holds.
- `cashu-token-listener.test.ts`:
  - a token from a trusted mint that is not the default is received, pays, and its proofs stay at that mint;
  - a token from a mint untrusted after the payment was created is refused (`untrustedMint`);
  - the existing `0011` test becomes "a token from a mint not trusted is not received".
- `payment-cashu-preparation.test.ts`: the quote goes to the default from the Cashu database.
- `cashu-payment-request.test.ts`: the request lists several mints in order and capped; the existing single-mint vector stays.

Web e2e (`apps/web-app/e2e/cashu.spec.ts`):

- the mints screen lists the default under "Trusted";
- a suggestion opens its detail, and "Trust" moves it up;
- "Use for payments" moves the badge;
- untrusting a mint with a balance moves it to "Other mints with a balance".

Native:

- the `cashu-mints-page-model` unit test;
- `e2e/flows/cashu/mints-screen-lists-default-mint.yaml` updated for the new section title.

## Phases

Each phase ends with a green `bun run check` and is its own Conventional Commit.

1. **Decisions:** drafts of `0017`–`0019`, with `0011`, `0013` and `0016` marked `superseded by`. `check:decisions` requires the tests named under `Enforced by` to exist, so the records land with phase 2 when that check refuses them.
2. **Core:**
   - `defaultedAt`, the queries and the pure helpers;
   - trust/untrust/default actions and errors, and the seed on enable;
   - payment preparation and the listener reading the Cashu database;
   - `buildCashuPaymentUri(mintUrls)`;
   - removing `accountCashu.mintUrl`;
   - the tests, the two-device ones included.
3. **Web and native:**
   - `useCashuWallet`;
   - the mints screen, the detail page and the wait page request;
   - i18n;
   - the QR check at the cap (rule 6);
   - the e2e test and Maestro flow updates.
4. **Docs:**
   - `docs/cashu.md`: §4 (the account no longer holds the mint), §8 and the listener row;
   - `docs/glossary.md`: "known mints" → "trusted mints", and the "payment mint" → "default mint" wording;
   - the `AGENTS.md` Cashu paragraph, if it names either.

No data migration is needed: Cashu is in no release yet. On a development account, the existing `cashuMint` rows become trusted, and enabling Cashu again seeds the default.

## Verification

- `bun run check`, the unit tests above, `bun run test:e2e -- cashu`, `bun run test:e2e:native:web`.
- Manually:
  1. On two devices of one account, choose a different default on each while one is offline; after both sync, both show the same, newer one.
  2. Scan the Cashu QR with three trusted mints on a small phone.
  3. Pay with a token from a trusted mint that is not the default: the payment is paid, and the balance shows at that mint.
