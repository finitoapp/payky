# 0002 The assistant chat lives in memory and asks no consent

Status: accepted
Date: 2026-10-05

## Context

The assistant (`src/core/ai/assistant.ts`) gets a page in the settings,
next to the support chat, so merchants can ask about their bills and
payments. A conversation needs its earlier questions and replies to answer
a follow-up. What the model reads through its tools leaves the device
through Payky's AI proxy to the provider (ai/0001).

## Decision

The settings offer the assistant to every merchant at `/settings/assistant`.
The conversation lives in a Jotai atom: it outlives leaving the page and
moving around the app, but not a reload, and nothing of it is written to
Evolu. It belongs to the account it was held with, so switching accounts
starts afresh. The model sees the last twenty messages of it, starting at a
question; a question that failed is left out until it is asked again.

Leaving the page or the stop button stops a reply that is still coming, and
the words that came so far stay, marked as stopped.

Replies are plain text: the system prompt asks for it and the page shows
the text as it is, without a Markdown renderer.

The page asks no consent and shows no notice before data goes to the
provider; its empty state says only that it answers through an AI provider.

## Alternatives considered

Keeping the conversation in Evolu, which was rejected for now: it would
sync across the account's devices, but needs a table, its deletion and a
schema change for a prototype. State of the page alone, which was rejected
because leaving the page to look something up lost the conversation.

A Markdown renderer, which was rejected to keep a dependency out; a model
that writes Markdown anyway shows its asterisks.

A one-time consent dialog or a notice under the composer, which were
rejected by product choice.

The assistant only in the developer build or behind a setting, which was
rejected: it is offered to everyone.

## Consequences

A reload loses the conversation, and another device of the account never
sees it. Each request carries the conversation so far, so a long one costs
more tokens, up to the twenty-message cap. Merchants are not told before
their data reaches the provider. The web app has no documentation or source
code tools, so it answers from the data and the system prompt only.

## Enforced by

- `src/features/settings/assistant/assistant-conversation.test.ts > toAssistantMessages > sends the earlier questions and replies, then the new question`
- `src/features/settings/assistant/assistant-conversation.test.ts > toAssistantMessages > leaves out a turn that failed or was stopped before any reply`
- `src/core/ai/assistant.test.ts > recentMessages > keeps the last twenty messages, starting at a question`
- `src/core/ai/assistant.test.ts > askAssistant > stops with the reply so far when its run is aborted`
- `e2e/settings-assistant.spec.ts > asks the assistant and keeps the conversation`
- `e2e/settings-assistant.spec.ts > retries a question the assistant could not answer`
