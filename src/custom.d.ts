import type { IntegerString, TimestampMs } from "@/modules/shared/schema"

declare global {
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
