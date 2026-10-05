import { describe, expect, test, vi } from "vitest"

import { type AiProxyConfig, handleAiChatRequest } from "./completions.ts"

// Shaped like a real one: 22 Base64Url characters.
const ownerId = "Vu6kLCCtCCwfgw5M7Kq6Fg"

const config: AiProxyConfig = {
  upstreamUrl: "https://upstream.test/v1",
  upstreamApiKey: "server-key",
  model: "server-model",
  maxTokens: 1000,
}

const chatRequest = ({
  authorization = `Bearer ${ownerId}`,
  body = { model: "client-model", messages: [{ role: "user", content: "Hi" }] },
}: {
  readonly authorization?: string | null
  readonly body?: unknown
} = {}) =>
  new Request("https://payky.me/api/ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorization === null ? {} : { authorization }),
    },
    body: JSON.stringify(body),
  })

const upstreamReturning = (response: Response) =>
  vi.fn<typeof fetch>(() => Promise.resolve(response))

describe("handleAiChatRequest", () => {
  test.each([
    ["no bearer token", null],
    ["a token that is not an owner id", "Bearer sk-not-an-owner-id"],
  ])("rejects a request with %s", async (_, authorization) => {
    const fetch = upstreamReturning(new Response("{}"))

    const response = await handleAiChatRequest(chatRequest({ authorization }), {
      config,
      fetch,
    })

    expect(response.status).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })

  test("sends the request upstream with the server's key and model, its tokens capped", async () => {
    const fetch = upstreamReturning(new Response("{}"))

    await handleAiChatRequest(
      chatRequest({
        body: {
          model: "client-model",
          messages: [{ role: "user", content: "Hi" }],
          tools: [{ type: "function" }],
          max_tokens: 5000,
          max_completion_tokens: 5000,
        },
      }),
      { config, fetch }
    )

    const [url, init] = fetch.mock.calls[0] ?? []
    expect(url).toBe("https://upstream.test/v1/chat/completions")
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer server-key"
    )
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "server-model",
      messages: [{ role: "user", content: "Hi" }],
      tools: [{ type: "function" }],
      max_tokens: 1000,
    })
  })

  test("streams the upstream reply through unchanged", async () => {
    const stream = 'data: {"choices":[]}\n\ndata: [DONE]\n\n'
    const fetch = upstreamReturning(
      new Response(stream, { headers: { "content-type": "text/event-stream" } })
    )

    const response = await handleAiChatRequest(chatRequest(), {
      config,
      fetch,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("text/event-stream")
    expect(response.headers.get("access-control-allow-origin")).toBe("*")
    expect(await response.text()).toBe(stream)
  })

  test("passes an upstream error through with its status", async () => {
    const fetch = upstreamReturning(
      Response.json({ error: { message: "quota" } }, { status: 429 })
    )

    const response = await handleAiChatRequest(chatRequest(), {
      config,
      fetch,
    })

    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: { message: "quota" } })
  })

  test("answers a CORS preflight and refuses other methods", async () => {
    const preflight = await handleAiChatRequest(
      new Request("https://payky.me/api/ai/v1/chat/completions", {
        method: "OPTIONS",
        headers: { "access-control-request-headers": "authorization, x-test" },
      }),
      { config }
    )
    const get = await handleAiChatRequest(
      new Request("https://payky.me/api/ai/v1/chat/completions"),
      { config }
    )

    expect(preflight.status).toBe(200)
    expect(preflight.headers.get("access-control-allow-headers")).toBe(
      "authorization, x-test"
    )
    expect(get.status).toBe(405)
  })
})
