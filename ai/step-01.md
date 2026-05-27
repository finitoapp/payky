# Step 01 - Extend the Web Stack Baseline

## Goal

Add the missing application stack pieces required by the brief without changing product behavior yet. The app must still run as the current prototype after this step.

## Scope

- Dependency management and scripts only.
- No user-facing feature implementation.
- No persistent domain data migration yet.

## Tasks

1. Add runtime dependencies needed by the planned app:
   - `@tanstack/react-form`
   - Evolu packages used by the app, including `@evolu/common` for `Result`, `ok`, and `err`
   - `zod` as an explicit dependency
   - QR rendering dependency for payment QR codes
   - `@buildonspark/spark-sdk`
   - `assert-never`
   - `type-fest`
2. Add test tooling scripts based on Bun:
   - `test`
   - `test:watch`
3. Keep Bun as the only package manager.
4. Keep `exact = true` in all Bun config files that exist in the repo.
5. Ensure TypeScript path aliases still work in app and tests.
6. Document any dependency that cannot be installed cleanly and keep the app buildable.

## Acceptance Criteria

- `package.json` contains the dependencies and Bun scripts needed by later steps.
- `bun.lock` is updated by Bun only.
- Existing app routes still render.
- Existing domain tests, if present, still run.
- No new user-facing text is added.

## Verification

Run:

```sh
bun install
bun run typecheck
bun run check
bun test
bun run build
```

The app is considered working after this step if the same screens as before still load and all checks pass.
