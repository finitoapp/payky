# 0007 The station number goes in the specific symbol

Status: accepted
Date: 2026-10-07

## Context

A bank transfer is matched to a payment by its variable symbol, the
payment's serial number, and its specific symbol, the date as `YYMMDD`. Each
station numbers its payments in its own series, so a station's payment and
the owner's can share a serial and a date.

## Decision

Each station gets the next number, 1 to 9999, never reused. A station's
specific symbol is that number followed by `YYMMDD`. The owner's stays six
digits, so no two of them can collide.

## Alternatives considered

Giving stations a range of variable symbols: it caps how many payments a
station takes a day.

## Consequences

The owner can have at most 9999 stations. Two owner devices creating
stations offline at the same time can hand out one number twice.

## Enforced by

- `src/core/modules/payment/payment-symbol-utils.test.ts > createSpecificSymbolFromDate > puts a station's number before the date`
- `src/core/modules/payment/payment-preparation-actions.test.ts > payment preparation actions > at a PoS station > puts the station number before the date in the specific symbol`
- `src/core/modules/station/station-actions.test.ts > createStation > gives each station its own key and the next number, revoked ones counted`
