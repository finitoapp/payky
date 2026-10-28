# 0013 The page on how Payky works claims only what the code does, the Cashu wallet in the account's backup included

Status: accepted
Date: 2026-10-28

## Context

This restates landing/0009 with one change: since cashu/0012 the Cashu
wallet is Payky's own and lives in the app database, so Cashu no longer
contacts Linky's relays or linky.fit, and its data travels with the rest of
the backup under the account's identifier. An account that never turned
Cashu on has no Cashu data.

The page (landing/0008) asks merchants to trust Payky with their takings
on the strength of technical claims: nobody reads the data, nothing stands
between the customer and the money, nothing is tracked. A claim that is
only nearly true does more harm there than anywhere else, and it is easy to
round up: two default relays run by two parties, a Spark network whose
operators see payments, a PIN that is no cryptography, an AI assistant and
donations that do go through Payky's server.

## Decision

A technical claim appears on the page only when the code does it. Where
the honest answer is "partly", the page says which part, as these do:

- The backup goes to two relays by default, Payky's and that of Linky, a
  friendly project built on the same principles (`defaultEvoluTransportUrls`).
  Relays see an account identifier, timing and size, not content.
- QR payments: no Payky server takes part; automatic matching works with
  Fio banka only. Lightning payments: Spark operators and a Lightning
  gateway see amount and time, Payky does not. Card payments: Switchio and
  the merchant's bank, as with any terminal.
- The PIN keeps staff at the counter out and does not stop an attacker
  (access/0001).
- EET receipts go from the device to the Financial Administration
  directly.
- Error reporting is off until turned on; no analytics run.
- Cashu payments, once turned on, talk to the mints (which see amounts and
  times), sync the Cashu wallet with the rest of the backup over the
  account's relays and under the account's identifier, and receive tokens
  over the nostr relays the payment request names (cashu/0012, cashu/0006).
  Before Cashu is turned on, no Cashu data exists to sync and none of these
  is contacted for Cashu.

The section on services lists everything the app talks to, grouped by when
it happens — whenever the app is used, only once turned on, only for a
specific action — with Payky's own servers first in each group and marked
as such, each with what is sent, when, and for Payky's servers why. Until
something is turned on or used, the app talks at most to the payky.me
website and the two default relays; the page says so, and a new
connection that breaks it changes that sentence too.
A new outbound connection — an integration, an `api/` endpoint, a relay
default — is added to that list in the same change.

The section on transparency claims only what the repository shows: the
code is public under MIT, and each decision record names the tests that
hold it or explains why it has none (`check:decisions`). It claims no
audit, no bug bounty and no security contact, none of which exists, and it
says outright that nobody can prove the shipped app was built from the
public code, because builds are not reproducible — and that whoever does
not want to trust the shipped build can build the app from the public code
and run their own. Its contrast with closed
apps stays in the diagram; the text says nothing about licences or
regulators. Its example claim links to a decision and a test on the public
repository, and the test of this record checks that the decision still
names that test.

KYC and AML are explained only technically: Payky never holds or forwards
money, so it has nothing to verify a merchant for. The page says nothing
about a business's own legal duties.

These facts were confirmed by the project's owner on 2026-10-13: Linky is
a friendly project, EET goes out directly, the Spark wallet opens with the
recovery phrase in another Spark app, and the repository is public at
https://github.com/finitoapp/payky.

## Alternatives considered

A short list of "no servers" claims without the exceptions: rejected, the
exceptions are exactly what a careful reader checks first.

## Consequences

The page is wrong whenever the app gains a connection the list omits, and
no test can see that from the code. Review of any change to
`packages/core/src/integrations`, `api/` or the relay defaults has to look at the
list.

## Enforced by

- `packages/core/src/modules/cashu/cashu-app-database.test.ts > the Cashu wallet in the app database (cashu/0012) > an account that never enabled Cashu has no Cashu rows to sync`
- `apps/web-app/e2e/cashu.spec.ts > an account without Cashu reaches no mint`
- `apps/landing/src/landing-server.test.tsx > renderLandingDocument > lists every service the app talks to on the page on how Payky works`
- `apps/landing/src/landing-server.test.tsx > renderLandingDocument > follows a claim of the page on how Payky works to the decision and the test that hold it`

The test checks that the list renders; whether it is complete is for
review to judge.
