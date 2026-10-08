import { describe, expect, test } from "vitest"

import { scrubBreadcrumb, scrubEvent } from "@/core/sentry.ts"

const masterKey = "000102030405060708090a0b0c0d0e0f"
const secretKey =
  "7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e"
const traceId = "4bf92f3577b34da6a3ce929d0e0e4736"

describe("sentry scrubbing", () => {
  test("redacts 32- and 64-hex secrets but keeps the trace context", () => {
    const event = scrubEvent({
      type: undefined,
      message: `key ${masterKey}`,
      exception: { values: [{ value: `failed for ${secretKey}` }] },
      contexts: { trace: { trace_id: traceId, span_id: "00f067aa0ba902b7" } },
    })

    expect(event.message).toBe("key [redacted]")
    expect(event.exception?.values?.[0]?.value).toBe("failed for [redacted]")
    expect(event.contexts?.trace?.trace_id).toBe(traceId)
  })

  test("redacts hex secrets in breadcrumbs", () => {
    const breadcrumb = scrubBreadcrumb({
      message: `s=${masterKey}`,
      data: { key: secretKey },
    })

    expect(breadcrumb.message).toBe("s=[redacted]")
    expect(breadcrumb.data).toEqual({ key: "[redacted]" })
  })
})
