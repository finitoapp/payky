// The e2e builds' stand-in for every outside HTTP service (native-e2e.md
// 4.4): EET, the donation and assistant APIs, and whatever else a flow needs.
// Each service is a handler in e2e/scripts/mocks/; the first that answers a
// request wins, anything else is a 404 (logged, so a missing mock shows).
// The build points at it through EXPO_PUBLIC_* URLs (run.ts).

import type { MockHandler } from "./mocks/mock-handler.ts"
import { yadioMock } from "./mocks/yadio.ts"

const handlers: ReadonlyArray<MockHandler> = [yadioMock]

export function serveMocks(port: number) {
  return Bun.serve({
    hostname: "0.0.0.0",
    port,
    async fetch(request) {
      const url = new URL(request.url)
      if (request.method === "OPTIONS")
        return new Response(null, { status: 204, headers: corsHeaders })
      for (const handle of handlers) {
        const response = await handle(request, url)
        if (response !== undefined) {
          for (const [key, value] of Object.entries(corsHeaders))
            response.headers.set(key, value)
          return response
        }
      }
      console.error(
        `mock-server: no mock for ${request.method} ${url.pathname}`
      )
      return new Response("no mock", { status: 404, headers: corsHeaders })
    },
  })
}

// The web build calls it cross-origin.
const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  "access-control-allow-headers": "*",
}

if (import.meta.main) {
  const [port = "8791"] = process.argv.slice(2)
  serveMocks(Number(port))
  console.log(`mocks on http://127.0.0.1:${port}`)
}
