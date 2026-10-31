# 0033 A mint Payky works with lists NUT-07 and NUT-09

Status: accepted
Date: 2026-10-29

## Context

Payky's wallet asks its mints two things all the time. NUT-07 tells which
proofs are spent: selecting a melt's sources, keeping only unspent outputs
of a reclaim, checking a melt's pre-swap, judging which operation could
have signed a shared block (`cashu/0029`). NUT-09 returns outputs the mint
signed: every reclaim, the scan that places a counter, the recovery of
orphans (`cashu/0031`).

Nothing required a mint to list them. One place worked around a missing
NUT-07: a receive swapped the token without checking it first. The rest
failed only midway, once money was already out. A lost swap could not be
reclaimed, a melt could not select its sources, and funds at that mint
could be neither moved nor withdrawn.

The default mint, `cashu.cz` (Nutshell 0.21), and CDK mints such as
`testnut.cashu.space` and Minibits list both.

## Decision

- `loadCashuWallet`, the one way to a cashu-ts wallet, refuses a mint
  whose info does not list NUT-07 and NUT-09, with
  `CashuMintUnsupported` naming what is missing. Every Task refuses such a
  mint before it writes or sends anything, and trusting it fails, since
  trusting loads it.
- A receive always checks the token's proofs (NUT-07) before its swap.
  There is no path without it.
- A mint already trusted that does not list them, trusted before this
  decision or since it stopped listing them: the mint's screen says so and
  will not make it the default. A token from it is refused for the run, and
  its arrival says the mint cannot be used.

## Alternatives considered

- A path without NUT-07 or NUT-09 in each operation: a reclaim cannot tell
  spent outputs from unspent without NUT-07, nor find signed outputs
  without NUT-09. Each would guess, and money would be booked on a guess.
- Checking only when a mint is trusted: a mint can stop listing a NUT
  later, and the trust list syncs in from other devices.

## Consequences

Funds already at a mint that lists neither stay in the balance, as before,
and cannot be moved out by Payky. They could not before either, but now
the reason is shown up front. A mint that lists the NUTs but answers them
wrongly is not caught here.

## Enforced by

- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > trusting mints > refuses a mint that does not list NUT-0$nut (cashu/0033)`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a token from a mint that does not list NUT-07 is refused before anything is written (cashu/0033)`
