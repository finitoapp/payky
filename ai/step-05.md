# Step 05 - Define External Adapter Ports

## Goal

Create stable ports for external integrations so business logic can be tested without network, Spark SDK, browser APIs, or concrete HTTP endpoints.

## Scope

- Ports and mock adapters.
- No real Spark receive payments yet.
- No real Yadio HTTP call yet unless it is behind the adapter.

## Tasks

1. Add domain-level ports for:
   - clock
   - ID generation
   - exchange rates
   - Spark receive payments
   - QR payload creation
   - persistence transactions
2. Add mock implementations for tests and local development.
3. Add a Yadio adapter skeleton behind the exchange-rate port.
4. Add a Spark adapter skeleton behind the Spark payment port.
5. Add a QR payload adapter for SPD payload creation.
6. Return expected failures as `Result` from `@evolu/common`.
7. Use thrown exceptions only for programmer errors or framework boundaries.

## Acceptance Criteria

- Domain use-cases depend on ports, not concrete infrastructure.
- Mock adapters can simulate success, failure, expiration, and offline states.
- No domain module imports Spark SDK, `fetch`, `window`, `document`, or React.
- Adapter skeletons are typechecked and documented by tests or usage.

## Verification

Run:

```sh
bun run typecheck
bun run check
bun test
bun run build
```

Manual check:

- Start the app with mock adapters.
- Confirm existing payment prototype behavior still works.
