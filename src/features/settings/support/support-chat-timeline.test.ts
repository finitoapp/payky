import { describe, expect, test } from "vitest"

import { buildTimeline, type ChatEntry } from "./support-chat-timeline.ts"

const at = (iso: string) => Math.floor(new Date(iso).getTime() / 1000)

const entry = (id: string, author: string, iso: string): ChatEntry => ({
  id,
  author,
  fromSupport: author !== "me",
  text: id,
  sentAt: at(iso),
  status: "sent",
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
})
