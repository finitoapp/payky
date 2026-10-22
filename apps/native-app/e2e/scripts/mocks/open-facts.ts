// The Open Facts product lookup (apps/web-app/e2e/bill-scan.spec.ts's
// `page.route("https://world.openfoodfacts.org/**")`). The client's hosts are
// built in, so the fetch dep sends them to `/__host/<host>/...` here
// (src/e2e/e2e-fetch.ts).
//
// Web's spec counts the requests to prove an opted-out device and an internal
// code send none; a flow cannot read that back, so the mock counts them and
// answers control requests (subflows/open-facts-mock.yaml):
// `GET /__mock/open-facts/reset` zeroes the count, and
// `GET /__mock/open-facts/expect?count=N` answers 200 when N lookups were
// made, 409 with the count otherwise.
import type { MockHandler } from "./mock-handler.ts"

let lookups = 0

export const openFactsMock: MockHandler = (_request, url) => {
  const { pathname } = url
  if (pathname === "/__mock/open-facts/reset") {
    lookups = 0
    return new Response("ok")
  }
  if (pathname === "/__mock/open-facts/expect") {
    const expected = Number(url.searchParams.get("count"))
    return lookups === expected
      ? new Response("ok")
      : new Response(`${lookups} lookups, expected ${expected}`, {
          status: 409,
        })
  }
  if (!pathname.startsWith("/__host/world.openfoodfacts.org/api/v2/product/"))
    return undefined
  lookups += 1
  // Every barcode is the product web's spec answers with.
  return Response.json({
    status: 1,
    product: {
      product_name: "Coca-Cola Original",
      brands: "Coca-Cola",
      quantity: "330 ml",
    },
  })
}
