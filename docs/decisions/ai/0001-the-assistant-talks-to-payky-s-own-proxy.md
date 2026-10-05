# 0001 The assistant talks to Payky's own proxy, which trusts every owner id

Status: accepted
Date: 2026-10-05

## Context

The assistant (`src/core/ai/assistant.ts`) needs a language model, and the
web app cannot hold a provider's API key: anything shipped to the browser
or the native app is public. The provider and the model should also change
with a deploy rather than with an app release. The assistant's tools read
the merchant's local Evolu data, so they have to run in the app, not on a
server. Payky has no user accounts on its servers. The only identity every
app has is its Evolu owner id, and that is not a secret: the sync relay
sees it, and any string of its shape is a valid one.

## Decision

Payky serves an OpenAI-compatible endpoint, `/api/ai/v1/chat/completions`,
and the web app and the CLI use it by default. The app sends the active
account's Evolu owner id as the bearer token. The endpoint accepts every
well-formed owner id, with no list of allowed or blocked ones and no rate
limit, replaces the requested model with its own, caps `max_tokens`, and
forwards the request to an OpenAI-compatible provider with the server's
key. The reply, streamed or not and errors included, passes back unchanged,
so tool calls reach the app and its tools run there.

The provider is configured only on the server: `PAYKY_AI_UPSTREAM_URL`
(Gemini's OpenAI-compatible endpoint by default), `PAYKY_AI_UPSTREAM_API_KEY`,
`PAYKY_AI_UPSTREAM_MODEL` and `PAYKY_AI_MAX_TOKENS`. The CLI can point
`PAYKY_AI_BASE_URL` at another OpenAI-compatible endpoint, such as a local
Ollama, for development.

## Alternatives considered

A provider key in the app, which was rejected because it would be public.

NIP-98, signing each request with the account's Nostr key, which was
rejected for now: it proves the request comes from the account, but an
account costs nothing to create, so without a quota per account it stops
no abuse.

An allowlist or blocklist of owner ids and a rate limit, which were left
out for now. A rate limit needs a store, since Vercel functions keep no
state.

Payment per request over Lightning (L402), platform attestation and a
captcha, which would actually limit abuse but cost far more than a first
version needs.

Translating between providers on the server with the AI SDK, which was
rejected while the chosen provider speaks the OpenAI protocol itself.

## Consequences

The endpoint is open: anyone who calls it with a string shaped like an
owner id spends Payky's provider quota, and nothing tells one caller from
another. The owner id identifies a caller only for as long as callers are
honest. Changing the provider or the model is a deploy. Whatever the model
reads through the tools leaves the device through Payky's server to the
provider, so the provider's data terms apply to merchants' data. A
provider without an OpenAI-compatible API needs a translating proxy first.

## Enforced by

- `api/ai/v1/chat/completions.test.ts > handleAiChatRequest > rejects a request with %s`
- `api/ai/v1/chat/completions.test.ts > handleAiChatRequest > sends the request upstream with the server's key and model, its tokens capped`
- `api/ai/v1/chat/completions.test.ts > handleAiChatRequest > streams the upstream reply through unchanged`
- `api/ai/v1/chat/completions.test.ts > handleAiChatRequest > passes an upstream error through with its status`
- `api/ai/v1/chat/completions.test.ts > handleAiChatRequest > answers a CORS preflight and refuses other methods`
