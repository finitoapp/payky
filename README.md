# React + TypeScript + Vite + shadcn/ui

This is a template for a new Vite project with React, TypeScript, and shadcn/ui.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `src/components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button"
```

## CLI Configuration

The Bun CLI reads `.env` files automatically. CLI environment variables are
validated at startup with `@t3-oss/env-core` and Zod.

```bash
PAYKY_SQLITE_PATH=./data/payky.db bun bin/cli.ts payments list
bun --env-file=.env.cli bin/cli.ts accounts list
```

Supported variables:

- `PAYKY_SQLITE_PATH`: SQLite database file path. Defaults to `payky.db`.
