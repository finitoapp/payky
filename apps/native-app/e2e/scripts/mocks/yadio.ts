import type { MockHandler } from "./mock-handler.ts"

/** Yadio's `/exrates/<fiat>`: the same rate web's donation mock reports. */
export const yadioMock: MockHandler = (_request, url) =>
  url.pathname.startsWith("/exrates/")
    ? Response.json({ BTC: 1_500_000, timestamp: Date.now() })
    : undefined
