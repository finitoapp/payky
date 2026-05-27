# Step 10 - Implement Exchange Rate and Spark Receive Flow

## Goal

Deliver BTC receive payments through the Spark adapter with a mockable, testable flow and clear offline behavior.

## Scope

- Yadio exchange-rate adapter.
- Spark receive adapter.
- Main screen Spark flow.
- Payment status observation.
- Mock adapter tests.

## Tasks

1. Implement the Yadio adapter behind the exchange-rate port.
2. Convert fiat amount to BTC sats through a domain service.
3. Implement the Spark receive adapter behind the Spark port.
4. Derive or inject Spark seed material according to the Evolu seed strategy.
5. Create one new Spark invoice per payment.
6. Render the invoice/payment request as a QR code.
7. Observe payment status through the adapter.
8. Support statuses:
   - `paid`
   - `failed`
   - `expired`
   - `canceled`
9. Show a translated offline message when Spark payment cannot be created.
10. Add mock-adapter tests for success, failure, expiration, and cancellation.

## Acceptance Criteria

- Spark payment creation requires online capability.
- Spark SDK usage is contained in the infrastructure adapter.
- Domain logic can be tested with the mock Spark adapter.
- BTC amount, exchange rate, source, fetched timestamp, invoice, and technical data are stored.
- Activity detail can show Spark technical payment data.

## Verification

Run:

```sh
bun test
bun run typecheck
bun run check
bun run build
```

Manual check:

- Create a Spark payment with mock adapters.
- Simulate paid, failed, expired, and canceled outcomes.
- Turn the browser offline and confirm Spark creation is blocked with a clear message.
