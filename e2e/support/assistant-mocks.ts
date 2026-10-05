import type { Page } from "@playwright/test"

const AI_PROXY_URL = "**/api/ai/v1/chat/completions"

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "POST, OPTIONS",
}

/** An OpenAI chat completion stream that answers with `text`. */
const completionStream = (text: string): string =>
  [
    {
      id: "e2e",
      object: "chat.completion.chunk",
      created: 0,
      model: "e2e",
      choices: [
        {
          index: 0,
          delta: { role: "assistant", content: text },
          finish_reason: null,
        },
      ],
    },
    {
      id: "e2e",
      object: "chat.completion.chunk",
      created: 0,
      model: "e2e",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    },
  ]
    .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
    .join("")
    .concat("data: [DONE]\n\n")

export type AssistantMockReply =
  | { readonly text: string }
  | { readonly status: number }

/**
 * Answers the assistant's requests to Payky's AI proxy with `replies`, one
 * per request in order; the last one repeats. Returns the bearer token and
 * messages of every request, so a spec can check what the app sent.
 */
export async function mockAssistantProxy(
  page: Page,
  replies: ReadonlyArray<AssistantMockReply>
): Promise<{
  readonly requests: ReadonlyArray<{
    readonly authorization: string | null
    readonly messages: ReadonlyArray<{
      readonly role: string
      readonly content: unknown
    }>
  }>
}> {
  const requests: Array<{
    authorization: string | null
    messages: ReadonlyArray<{
      readonly role: string
      readonly content: unknown
    }>
  }> = []

  await page.route(AI_PROXY_URL, async (route) => {
    const request = route.request()
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders })
      return
    }
    requests.push({
      authorization: await request.headerValue("authorization"),
      messages: request.postDataJSON().messages,
    })
    const reply = replies[Math.min(requests.length, replies.length) - 1]
    if (reply === undefined || "status" in reply) {
      await route.fulfill({
        status: reply?.status ?? 500,
        headers: corsHeaders,
        json: { error: { message: "e2e failure" } },
      })
      return
    }
    await route.fulfill({
      headers: { ...corsHeaders, "content-type": "text/event-stream" },
      body: completionStream(reply.text),
    })
  })

  return { requests }
}
