# Step 02 - Add Evolu Persistence Foundation

## Goal

Introduce Evolu as the local-first persistence layer behind a narrow
repository boundary while keeping the visible app behavior equivalent to the
current in-memory prototype.

This step also locks the first persisted domain shape. Use `bill` terminology
for open POS accounts. Do not introduce `checkout` tables, types, repositories,
or routes in new persistence code.

## Scope

- Evolu schema setup.
- Repository interfaces and adapters.
- App provider wiring.
- Minimal seed data support for development.
- No user-facing feature implementation.
- No domain data migration from previous prototypes.

## Naming Rules

- Use `bill`, not `checkout`, for open POS accounts.
- Use `catalogItem` for editable sale item templates.
- Use `item` for immutable sale item snapshots.
- Use `billLine` for append-only bill line events.
- Do not create a `billItem` table. Current bill line summaries are read models
  calculated from `billLine` plus `item`.

## Evolu Schema

Create the app Evolu schema in a dedicated infrastructure module, following the
style of Finito's `AppSchema`:

- Table definitions are plain object fields inside `AppSchema`.
- Shared field shapes are extracted into reusable constants where helpful.
- Every table has `id`.
- Do not add `createdAt`, `updatedAt`, or `deletedAt` to app table schemas.
  Evolu provides these metadata fields automatically.
- FK-like fields use another table's `id` value.
- Nullable FK-like fields are explicit `nullable()`.
- Domain values are validated with Zod-compatible schemas.
- Export `createQuery`, `EvoluSchema`, `Evolu`, and inferred table output types.

Use these persisted structures.

### Shared Scalar Schemas

Define or reuse strict schemas for:

```ts
const TableIdSchema = z.string().min(1)
const NullableTableIdSchema = TableIdSchema.nullable()
const TimestampMsSchema = z.number().int().nonnegative()
const DateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u)
const NonEmptyStringSchema = z.string().trim().min(1)
const NonEmptyString255Schema = z.string().trim().min(1).max(255)
const NonNegativeIntegerSchema = z.number().int().nonnegative()
const PositiveIntegerSchema = z.number().int().positive()
const PositiveNumberSchema = z.number().positive()
const IntegerSchema = z.number().int()
```

Amounts must be stored in minor units as integers. For CZK, `12345` means
`123.45 CZK`. For BTC/Spark values, use satoshis.

### Enums

```ts
const FiatCurrencySchema = z.enum(["CZK"])
const CurrencySchema = z.enum(["CZK", "BTC"])
const PaymentMethodSchema = z.enum(["cash", "spark", "bankQr"])
const PaymentStatusSchema = z.enum([
  "created",
  "pending",
  "paid",
  "failed",
  "expired",
  "canceled",
])
const BillStatusSchema = z.enum(["open", "partiallyPaid", "paid", "canceled"])
const ItemLineTypeSchema = z.enum(["catalogItem", "manualAmount", "tip"])
const BillLineTagSchema = z.enum(["add", "remove"])
```

### `device`

`device` identifies the local POS/browser instance that authored rows. It is
useful for audit, future sync, and conflict debugging.

```ts
device: {
  id: TableIdSchema,
  name: NonEmptyString255Schema,
  deviceType: NonEmptyString255Schema.nullable(),
  browserName: NonEmptyString255Schema.nullable(),
  osName: NonEmptyString255Schema.nullable(),
}
```

### `catalogItem`

`catalogItem` is the editable template managed in Settings. It is not copied
onto bills directly. Creating a bill line from a catalog item first creates or
reuses an immutable `item` snapshot.

```ts
catalogItem: {
  id: TableIdSchema,
  deviceId: NullableTableIdSchema,
  name: NonEmptyString255Schema,
  description: NonEmptyString255Schema.nullable(),
  currency: FiatCurrencySchema,
  unitAmount: NonNegativeIntegerSchema,
  sortOrder: NonNegativeIntegerSchema,
}
```

Rules:

- `catalogItem` may be edited or deleted through Evolu deletion metadata.
- Existing bills must not change when a `catalogItem` changes.
- New bill lines use the current `catalogItem` values to derive an `item`
  snapshot.

### `item`

`item` is an immutable snapshot of sale item values used by bills, payments,
exports, and receipts. It has a deterministic `id` derived from the snapshot
values copied from `catalogItem`.

```ts
item: {
  id: TableIdSchema,
  catalogItemId: NullableTableIdSchema,
  name: NonEmptyString255Schema,
  description: NonEmptyString255Schema.nullable(),
  currency: FiatCurrencySchema,
  unitAmount: NonNegativeIntegerSchema,
}
```

Deterministic ID rule:

```ts
createIdFromString(
  JSON.stringify({
    catalogItemId,
    name,
    description,
    currency,
    unitAmount,
  })
)
```

Implementation requirements:

- Use a canonical object field order exactly as shown above.
- For catalog-derived snapshots, `catalogItemId` is the source
  `catalogItem.id`.
- If the same catalog item values are added repeatedly, reuse the same `item`
  row by deterministic id.
- If a catalog item is edited, future bill lines produce a different `item.id`
  when any included snapshot value changes.
- `item` rows must not be updated for catalog edits.
- Manual amounts and tips may use `catalogItemId: null`, but their item ids
  must still be deterministic from their own snapshot values.

### `table`

```ts
table: {
  id: TableIdSchema,
  deviceId: NullableTableIdSchema,
  name: NonEmptyString255Schema,
  sortOrder: NonNegativeIntegerSchema,
}
```

### `bill`

`bill` is the open POS account entity formerly described as checkout.

```ts
bill: {
  id: TableIdSchema,
  deviceId: NullableTableIdSchema,
  displayNumber: PositiveIntegerSchema,
  label: NonEmptyString255Schema.nullable(),
  tableId: NullableTableIdSchema,
  status: BillStatusSchema,
  currency: FiatCurrencySchema,
  closedAt: TimestampMsSchema.nullable(),
  canceledAt: TimestampMsSchema.nullable(),
}
```

Rules:

- A bill may have no table.
- Multiple open bills may point to the same table.
- Moving a bill between tables updates only `bill.tableId`.
- Paying a bill does not mutate `billLine` rows.

### `billLine`

`billLine` is the append-only event table for bill line changes. It follows
the Finito `posBillLine` pattern.

```ts
billLine: {
  id: TableIdSchema,
  billId: TableIdSchema,
  deviceId: NullableTableIdSchema,
  catalogItemId: NullableTableIdSchema,
  itemId: TableIdSchema,
  type: ItemLineTypeSchema,
  _tag: BillLineTagSchema,
  quantity: PositiveNumberSchema,
  totalAmount: NonNegativeIntegerSchema,
}
```

Rules:

- Rows are append-only. Do not update an existing `billLine` to change
  quantity, amount, or removal state.
- `_tag: "add"` increases the projected bill quantity and amount.
- `_tag: "remove"` decreases the projected bill quantity and amount.
- `quantity` is always positive. `totalAmount` is always non-negative. The
  sign is represented by `_tag`.
- `totalAmount` is stored in `bill.currency`, not necessarily item currency.
- Keep `catalogItemId` for audit/debugging, but projections merge by
  `billId + itemId + catalogItemId + type`.

### Bill Line Summary

There is no `billItem` table. A bill line summary is a non-persisted read model
calculated from `billLine` rows joined with immutable `item` snapshots.
App code may consume this shape, but `billLine` remains the source of truth.

```ts
BillLineSummary: {
  id: TableIdSchema,
  billId: TableIdSchema,
  catalogItemId: NullableTableIdSchema,
  itemId: TableIdSchema,
  type: ItemLineTypeSchema,
  name: NonEmptyString255Schema,
  description: NonEmptyString255Schema.nullable(),
  currency: FiatCurrencySchema,
  quantity: PositiveNumberSchema,
  totalAmount: NonNegativeIntegerSchema,
}
```

Deterministic ID rule:

```ts
createIdFromString(
  JSON.stringify({
    billId,
    catalogItemId,
    itemId,
    type,
  })
)
```

Projection rules:

- Build from all `billLine` rows for the bill.
- Join `item` by `itemId` for `name`, `description`, and item snapshot values.
- Remove or omit projected rows whose resulting quantity is `0`.
- Never persist the summary as a domain row. Recalculate it from
  `billLine` when current bill state is needed.

### `payment`

Payments may optionally settle a bill. Use `billId`, not `checkoutId`.

```ts
payment: {
  id: TableIdSchema,
  deviceId: NullableTableIdSchema,
  billId: NullableTableIdSchema,
  tableId: NullableTableIdSchema,
  method: PaymentMethodSchema,
  status: PaymentStatusSchema,
  fiatAmount: NonNegativeIntegerSchema,
  fiatCurrency: FiatCurrencySchema,
  tipAmount: NonNegativeIntegerSchema,
  btcAmountSats: NonNegativeIntegerSchema.nullable(),
  exchangeRate: PositiveNumberSchema.nullable(),
  exchangeRateSource: z.enum(["yadio"]).nullable(),
  exchangeRateFetchedAt: TimestampMsSchema.nullable(),
  variableSymbol: NonEmptyString255Schema.nullable(),
  bankQrPayload: NonEmptyStringSchema.nullable(),
  sparkInvoice: NonEmptyStringSchema.nullable(),
  sparkTechnicalDataJson: z.string().nullable(),
  paidAt: TimestampMsSchema.nullable(),
  expiresAt: TimestampMsSchema.nullable(),
  canceledAt: TimestampMsSchema.nullable(),
}
```

### `paymentLine`

Snapshot the bill line summary composition used for the payment. This keeps payment
history stable even if the bill remains open for partial payments.

```ts
paymentLine: {
  id: TableIdSchema,
  paymentId: TableIdSchema,
  billId: NullableTableIdSchema,
  catalogItemId: NullableTableIdSchema,
  itemId: TableIdSchema,
  type: ItemLineTypeSchema,
  quantity: PositiveNumberSchema,
  totalAmount: NonNegativeIntegerSchema,
}
```

### Settings and Number Series

```ts
appSettings: {
  id: TableIdSchema,
  fiatCurrency: FiatCurrencySchema,
  tipsEnabled: z.boolean(),
  presetTipPercentagesJson: z.string(),
  presetTipFixedAmountsJson: z.string(),
  paymentMethodOrderJson: z.string(),
  bankIban: NonEmptyString255Schema.nullable(),
  language: z.enum(["en", "cs"]),
  theme: z.enum(["system", "light", "dark"]),
}

paymentNumberSeries: {
  id: TableIdSchema,
  serialNumberDigits: PositiveIntegerSchema,
  yearFormat: z.enum(["default", "short"]),
  monthFormat: z.enum(["default", "hidden"]),
  dayFormat: z.enum(["default", "hidden"]),
  prefix: NonEmptyString255Schema.nullable(),
}

paymentLastNumber: {
  id: TableIdSchema,
  serialNumber: NonNegativeIntegerSchema,
  date: DateStringSchema.nullable(),
}
```

## Indexes

Add indexes for FK-like and high-traffic query fields. Indexes over creation or
deletion metadata must target Evolu-provided metadata fields, not app schema
fields.

- `item_catalogItemId`
- `bill_status`
- `bill_tableId_status`
- `billLine_billId_createdAt` using Evolu metadata
- `billLine_itemId`
- `payment_billId`
- `payment_tableId`
- `payment_status`
- `payment_createdAt` using Evolu metadata
- `payment_method_createdAt` using Evolu metadata
- `paymentLine_paymentId`
- `device_name`

If using a helper like Finito's FK index generator, keep explicit custom indexes
for status and timestamp queries.

## Repository Ports

Add narrow repository ports for:

- `catalogItems`
- `items`
- `tables`
- `bills`
- `payments`
- `settings`

Required bill repository operations:

- create bill
- assign bill to table
- move bill to another table
- remove table from bill
- add catalog item to bill
- add manual amount to bill
- add tip to bill
- append remove line for a bill line summary
- list open bills with calculated line summaries
- split bill
- partially pay bill
- cancel bill
- close bill as paid

Required item repository behavior:

- Creating a catalog-derived bill line must call a snapshot helper that creates
  or reuses the deterministic `item` row.
- Catalog item edits must not update existing `item` rows.

## Migration From Prototype Names

Replace persistence-facing `checkout` naming with `bill` naming:

- `Checkout` -> `Bill`
- `CheckoutItem` -> `BillLineSummary` for read models, or `BillLine` for
  persisted events
- `checkoutId` -> `billId`
- `checkout items` -> `bill lines` plus calculated line summaries

Existing UI route names may stay temporarily if already present, but new domain,
schema, repository, and persistence code must use `bill`.

## Tasks

1. Create the Evolu schema module with the structures above.
2. Add deterministic item snapshot helpers:
   - `createItemIdFromSnapshot`
   - `createBillLineSummaryId`
   - `createOrReuseCatalogItemSnapshot`
3. Add repository ports and Evolu-backed adapters.
4. Keep the existing in-memory app state as a fallback or development fixture
   until all screens are migrated.
5. Do not store domain data in `localStorage`.
6. Keep `language` and `theme` as the only allowed browser preference
   exceptions until they are migrated into settings.
7. Update tests and domain type names to use `bill` where this step touches
   persistence or repository contracts.

## Acceptance Criteria

- Evolu initializes during app startup.
- The app still opens offline after first load.
- Existing screens keep working even if no user data exists yet.
- Evolu-specific code is isolated under infrastructure/app provider modules,
  not scattered through React components.
- Business/domain modules do not import browser APIs or React.
- No new persistence-facing `checkout` schema, repository, or type is added.
- `catalogItem` and `item` are separate structures.
- `item.id` is deterministic from snapshot values.
- Bill line changes are append-only through `billLine`.
- Bill current state can be queried as `bill` plus calculated line summaries.

## Verification

Run:

```sh
bun run typecheck
bun run check
bun test
bun run build
```

Manual check:

- Open the app.
- Reload the app.
- Confirm no domain data is read from or written to `localStorage`.
- Add the same catalog item to a bill twice and confirm it reuses the same
  deterministic `item.id`.
- Edit the catalog item and add it again; confirm the new bill line uses a new
  `item.id` while existing bill lines remain unchanged.
