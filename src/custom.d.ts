/// <reference types="vite-plugin-pwa/react" />

import type { IntegerString, TimestampMs } from "@/core/modules/shared/schema"

declare global {
  const __APP_VERSION__: string
  const __E2E_TEST_BUILD__: boolean

  interface BigInt {
    toString(radix?: number): IntegerString
  }

  interface DateConstructor {
    now(): TimestampMs
    parse(s: string): TimestampMs
  }

  interface Date {
    getTime(): TimestampMs
  }
}
