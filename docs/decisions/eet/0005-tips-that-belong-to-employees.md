# 0005 Tips that belong to employees are left out of the reported sale

Status: accepted
Date: 2026-09-27

## Context

A tip is a reported sale when it is business income and meets the other
conditions of a reported sale. A tip that is an employee's income is income
from dependent activity, so it is not subject to EET, though it may be
recorded voluntarily (GFŘ seminar for developers, slide 65, and the GFŘ
guideline on the EET act, version 1.0 of 31 August 2016, section 2.2.2,
written for the first EET).

## Decision

The settings ask whether tips belong to the business or to employees. While
they belong to employees, a payment's sale is reported without its tip. The
business stays the default, so an account that never answers keeps reporting
tips. The choice applies to sales created afterwards, never to existing
ones.

## Alternatives considered

Creating no sale for a payment that is all employees' tip. It would break
the rule that a payment settled while EET is on gets a sale (see eet/0001),
so such a payment reports `0.00` instead. Writing an explicit default when
the settings are first opened. It would add a write without changing
behavior, so an empty value reads as the business.

## Consequences

A tip that belongs to employees is never reversed when it is refunded as the
tip: the tip has its own refund (see refund/0004), and its reversal covers
only a tip the sale reported (see eet/0011). A first settlement smaller than
the tip reports `0.00`, and the rest of the tip is left out of the extra
money (see eet/0012).

## Enforced by

- `src/core/modules/eet/eet-actions.test.ts > createEetSale > leaves the tip out while tips belong to employees`
- `src/core/modules/eet/eet-actions.test.ts > createEetSale > reports 0.00 for a payment that is all tip while tips belong to employees`
- `src/core/modules/eet/eet-actions.test.ts > createEetSale > reports the tip while nobody said who it belongs to`
- `src/core/modules/eet/eet-actions.test.ts > createEetSale > keeps the tip of a sale created before tips went to employees`
- `e2e/eet.spec.ts > tips that belong to employees are left out of the reported sale`
