import { describe, expect, test } from "vitest"

import type { SupportMessage } from "@/core/integrations/nostr/nostr-support-chat.ts"

import {
  buildTimeline,
  type ChatEntry,
  toChatEntries,
} from "./support-chat-timeline.ts"

const at = (iso: string) => Math.floor(new Date(iso).getTime() / 1000)

const entry = (id: string, author: string, iso: string): ChatEntry => ({
  id,
  author,
  fromSupport: author !== "me",
  text: id,
  sentAt: at(iso),
  type: "message",
  refersTo: [],
  status: "sent",
  reactions: [],
})

const sentAt = at("2026-10-03T10:00:00Z")

const question: SupportMessage = {
  id: "question",
  author: "me",
  fromSupport: false,
  text: "Is there a fee?",
  sentAt,
  type: "message",
  refersTo: [],
}

const reaction = (
  id: string,
  author: string,
  target: string,
  emoji = "👀"
): SupportMessage => ({
  id,
  author,
  fromSupport: author !== "me",
  text: emoji,
  sentAt,
  type: "reaction",
  refersTo: [target],
})

const deletion = (
  id: string,
  author: string,
  targets: ReadonlyArray<string>
): SupportMessage => ({
  id,
  author,
  fromSupport: author !== "me",
  text: "",
  sentAt,
  type: "deletion",
  refersTo: targets,
})

const shape = (entries: ReadonlyArray<ChatEntry>) =>
  buildTimeline(entries).map((item) =>
    item.kind === "day"
      ? "day"
      : `${item.key}${item.firstOfGroup ? " first" : ""}${item.lastOfGroup ? " last" : ""}`
  )

describe("support chat timeline", () => {
  test("groups a run by one author and starts a new run for another", () => {
    expect(
      shape([
        entry("a", "me", "2026-10-02T10:00:00"),
        entry("b", "me", "2026-10-02T10:01:00"),
        entry("c", "support", "2026-10-02T10:02:00"),
      ])
    ).toEqual(["day", "a first", "b last", "c first last"])
  })

  test("breaks a run after a pause", () => {
    expect(
      shape([
        entry("a", "me", "2026-10-02T10:00:00"),
        entry("b", "me", "2026-10-02T10:06:00"),
      ])
    ).toEqual(["day", "a first last", "b first last"])
  })

  test("puts a day heading before the first message of each day", () => {
    expect(
      shape([
        entry("a", "me", "2026-10-01T23:58:00"),
        entry("b", "me", "2026-10-02T00:01:00"),
      ])
    ).toEqual(["day", "a first last", "day", "b first last"])
  })

  test("shows each reaction under the message it reacts to, each emoji once", () => {
    expect(
      toChatEntries([
        question,
        reaction("r1", "support", "question"),
        reaction("r2", "support", "question"),
        reaction("r3", "support", "unknown"),
      ])
    ).toEqual([{ ...question, status: "sent", reactions: ["👀"] }])
  })

  test("drops what its own author deleted, a deleted message's reactions with it", () => {
    expect(
      toChatEntries([
        question,
        reaction("r1", "support", "question"),
        reaction("r2", "human", "question", "👍"),
        deletion("d1", "support", ["r1"]),
        // Only an event's author can delete it.
        deletion("d2", "support", ["r2"]),
      ])
    ).toEqual([{ ...question, status: "sent", reactions: ["👍"] }])
    expect(
      toChatEntries([
        question,
        reaction("r1", "support", "question"),
        deletion("d1", "me", ["question"]),
      ])
    ).toEqual([])
  })
})
