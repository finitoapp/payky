// The assistant's AI proxy (apps/web-app/e2e/support/assistant-mocks.ts): an
// OpenAI chat-completion stream. Web's spec feeds each test a reply list and
// reads back what the app sent; a flow cannot, so the mock answers by the
// last question and holds the request to what the spec asserted — a request
// that does not match gets a 400, so the flow's "answer is visible" check
// fails the same way the spec's `expect(proxy.requests...)` would.
import { resources } from "@payky/app-shared/i18n/resources"
import type { MockHandler } from "./mock-handler.ts"

const t = resources.en

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

interface ChatRequest {
  readonly messages: ReadonlyArray<{ role: string; content: unknown }>
  readonly tools?: ReadonlyArray<{ function: { name: string } }>
}

const textOf = (content: unknown): string =>
  typeof content === "string" ? content : JSON.stringify(content)

const sameList = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) =>
  a.length === b.length && a.every((value, index) => value === b[index])

// How many times each question came in: "today" fails on odd counts, which
// is web's `{ status: 400 }` then `{ text }` (a 400, because the AI SDK
// retries a 5xx itself).
const asked = new Map<string, number>()

export const assistantMock: MockHandler = async (request, url) => {
  if (
    request.method !== "POST" ||
    url.pathname !== "/api/ai/v1/chat/completions"
  )
    return undefined
  const body = (await request.json()) as ChatRequest
  const roles = body.messages.map(({ role }) => role)
  const toolNames = (body.tools ?? []).map((tool) => tool.function.name)
  const question = textOf(body.messages.at(-1)?.content)
  const count = (asked.get(question) ?? 0) + 1
  asked.set(question, count)

  const answer = (text: string | null) =>
    text === null
      ? Response.json({ error: { message: "e2e failure" } }, { status: 400 })
      : new Response(completionStream(text), {
          headers: { "content-type": "text/event-stream" },
        })

  if (question === t["settings.assistant.suggestion.howRefund"])
    // The documentation-only access: no data tools.
    return answer(
      sameList(toolNames.toSorted(), ["listFiles", "readFile", "searchCode"])
        ? "Open the payment and refund it."
        : null
    )
  if (question === t["settings.assistant.suggestion.openBills"])
    return answer("No bill is open.")
  if (question === "And payments?")
    // The follow-up carries the conversation so far, under the user's token.
    return answer(
      sameList(roles, ["system", "user", "assistant", "user"]) &&
        toolNames.includes("listOpenBills") &&
        /^Bearer \S{22}$/u.test(request.headers.get("authorization") ?? "")
        ? "You have no payments yet."
        : null
    )
  if (question === t["settings.assistant.suggestion.today"])
    return answer(count % 2 === 1 ? null : "Now it works.")
  return answer(null)
}
