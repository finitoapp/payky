# 0004 The EET playground is the sandbox, and every sale keeps its environment

Status: accepted
Date: 2026-09-27

## Context

A confirmation from the EET playground carries a POK ending in `-ff`, which
is not a real POK under the law (interface description, chapter 3.4.2.3). A
merchant may want to try EET before going live.

## Decision

There is no separate sandbox mode. With the playground selected, payments
create real records that go to the real playground, and nothing counts as
reported. Each sale freezes its environment, so switching to production
never resends a sandbox sale. A test certificate keeps production
unselectable. The settings ask for confirmation before switching to the
playground, and every terminal screen shows a banner while it is on.

## Alternatives considered

A simulated EET inside the app. It would test the simulator, not EET, and
add a production code path, while automated tests use a fake responder and
manual testing the real playground. A toast instead of the banner, which is
easier to miss than a banner the merchant cannot dismiss.

## Consequences

A sale left in the sandbox by mistake is never reported. The confirmation
and the banner are what guard against that.

## Enforced by

- `src/core/background-jobs/jobs/eet-reporting-job.test.ts > eet reporting job: delivery > keeps sandbox sales in the sandbox after switching to production`
- `src/core/modules/eet/eet-actions.test.ts > selectEetEnvironment > refuses production while a test certificate is stored`
- `e2e/eet.spec.ts > the sandbox asks first, warns on every terminal screen, and marks the paid screen`
