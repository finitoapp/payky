/**
 * The JSON responses and CORS preflight every handler here answers with.
 * Underscored, so Vercel does not deploy it as an endpoint of its own.
 *
 * `cacheControl` is the one header the handlers disagree on, and `methods`
 * what the preflight allows besides `OPTIONS`.
 */
export const jsonApi = <TBody>({
  cacheControl,
  methods,
}: {
  readonly cacheControl: string
  readonly methods: string
}) => {
  const headers = {
    "access-control-allow-origin": "*",
    "cache-control": cacheControl,
    "content-type": "application/json; charset=utf-8",
  } as const

  return {
    jsonResponse: (body: TBody, init?: ResponseInit): Response =>
      Response.json(body, {
        ...init,
        headers: { ...headers, ...init?.headers },
      }),
    preflightResponse: (): Response =>
      new Response(null, {
        headers: {
          ...headers,
          "access-control-allow-methods": `${methods}, OPTIONS`,
          "access-control-allow-headers": "content-type",
        },
      }),
  }
}
