# 0002 The chat shows reactions and honours deletions

Status: accepted
Date: 2026-10-03

## Context

Besides messages, NIP-17 carries NIP-25 reactions (kind 7) in a room, and
lets a client take back a message or a reaction by wrapping a NIP-09
deletion (kind 5) into the conversation; clients should then remove what
was deleted. Support reacts from Amethyst, and the chat of support/0001
read messages only, so a reaction never showed, and once it did, removing
it would leave it standing.

## Decision

The chat reads reactions and deletions beside messages. A reaction shows
under the message its last `e` tag names, each emoji once, and one that
names no message, or a message the chat does not hold, is not shown. A
reaction belongs to the chat by its room, as a message does.

A deletion removes the events its `e` tags name, but only those of its own
author, as NIP-09 has it; a deleted message takes its reactions with it. A
deletion counts by its author alone, the account or anyone who has been on
the support team, whatever it tags: it can only remove its author's own
events, and clients tag it differently.

## Alternatives considered

Showing a deleted message as deleted rather than removing it, which NIP-17
allows too; rejected as noise for a chat with support.

## Consequences

An older app keeps ignoring reactions and deletions, so it shows neither a
reaction nor its removal. The chat shows reactions without who gave them.

## Enforced by

- `src/core/integrations/nostr/nostr-support-chat.test.ts > support chat > reads support's reaction to a message, and drops one that names no message`
- `src/core/integrations/nostr/nostr-support-chat.test.ts > support chat > reads a deletion by a support member however it is tagged, but none by a stranger`
- `src/features/settings/support/support-chat-timeline.test.ts > support chat timeline > shows each reaction under the message it reacts to, each emoji once`
- `src/features/settings/support/support-chat-timeline.test.ts > support chat timeline > drops what its own author deleted, a deleted message's reactions with it`
