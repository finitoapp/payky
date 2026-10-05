# 0003 A bot answers the support chat first

Status: superseded by support/0004
Date: 2026-10-03

## Context

Merchants write to support through the NIP-17 group chat of support/0001,
and most of what they ask is how the app behaves, which `docs/` and the
code already answer. Support is a few people who answer from Amethyst when
they get to it. Payky's repository is public. The chat's members come from
`/api/support-team`, and NIP-17 delivers every message of a room to all of
its members, so whoever is in the team sees the whole conversation.

## Decision

A bot is a member of the support team: its npub is in
`PAYKY_SUPPORT_NPUBS` like a person's, and it answers as itself, under the
name "Payky asistent (AI)", so a merchant can tell it from a person. It
runs as a long-lived process on a server of our own (`bin/support-bot.ts`),
holds its own key there, and reads and writes nothing but the support
rooms. A reply goes to the whole room, tagged like Amethyst's, so the
people from support read it too.

The bot answers only a merchant's latest message, after 45 seconds without
a new one, and not when it is over an hour old, so a restart or an outage
does not bring late replies. A conversation is the messages since the last
day of silence, and it is all the bot remembers. Once a person from support
has written in the conversation, or the bot has handed it over, the bot
stays silent until the next conversation. The bot keeps no state of its
own: it reads these rules again from the relays' history on start, and
tells its hand-over by the mentions only a hand-over carries.

A cheap model triages each message: nothing to answer, an answer from the
documentation, an answer that needs the code, or a hand-over. Once the
triage decides to answer, the bot reacts to the merchant's message with 👀,
which the app shows (support/0002), so the merchant sees it is working on
the answer. A reaction is no word in the conversation: the bot reads none,
so its own changes none of its rules. The answer comes from the model
configured for that depth. Every answer reads the whole of `docs/`; a
code answer can also read the source with tools. When
the bot cannot answer, the question needs a person, or it finds what looks
like a bug, it says so and hands over by mentioning the people from support
in the chat. It does nothing else about a bug.

The bot keeps its own clone of the public repository in a directory of its
own, apart from the code it runs from, and reads it through git only. The
docs come from the default branch. The code is read at the commit the
merchant's app names in its trailer, fetched when the clone does not have
it yet, and at the default branch, said as much, when no such commit
exists.

A merchant gets ten replies a day, three of them from the code, and all
merchants together thirty from the code; past that, and whenever a model
fails, the bot hands over with a fixed message in Czech and English. The
provider's spend limit is the hard cap on cost.

## Alternatives considered

A bot that drafts replies for a person to approve, which was rejected:
support wants the merchant answered right away, and the people see every
reply anyway.

A support platform with its own knowledge base (AgentDesk and the like),
which was rejected: none speaks NIP-17 groups, and the docs fit in a
model's context without retrieval.

An agent with a Nostr channel (OpenClaw and the like), which was rejected:
they handle 1:1 DMs, not a room recognised by its members, and carry far
more tools than a public chat should reach.

Reading the code the bot runs from, or a checkout per conversation, which
was rejected: the bot answers about the merchant's version, and reading
commits through git lets conversations on different versions run at once.

A database for the bot's state, which was rejected: the relays' history
already says who wrote last and whether the bot handed over.

## Consequences

Every reply of the bot reaches the people from support as well, with a
notification, because a NIP-17 room has no way to address part of it.
Adding the bot changes the team, so it starts a new room in Amethyst and
the line-up until then goes to `PAYKY_SUPPORT_FORMER_TEAMS`. Merchants'
messages go to the model provider. The bot must be restarted when the team
changes. A restart forgets how many code answers were given that day. The
bot answers about the app only as well as the public repository is current:
a commit that never reached it is answered from the default branch, and
docs that were never pushed are not known to it.

## Enforced by

- `src/core/support-bot/support-bot.test.ts > support bot > answers a merchant's question to the whole room once they stopped typing`
- `src/core/support-bot/support-bot.test.ts > support bot > hands over by mentioning the people from support, then stays silent`
- `src/core/support-bot/support-bot.test.ts > support bot > stays silent once a person from support replied`
- `src/core/support-bot/support-bot.test.ts > support bot > does not answer what it finds in the relays' history from hours ago`
- `src/core/support-bot/support-bot.test.ts > support bot > reads the code at the commit the merchant's app was built from`
- `src/core/support-bot/support-bot.test.ts > support bot > ignores a message with nothing to answer`
- `src/core/support-bot/support-bot.test.ts > support bot > hands over without a model past the daily limit or when the model fails`
- `src/core/support-bot/support-bot-policy.test.ts > support bot policy > reads a merchant's message to the team as that merchant's room`
- `src/core/support-bot/support-bot-policy.test.ts > support bot policy > ignores a team member's 1:1 with the bot and a room with a stranger`
- `src/core/support-bot/support-bot-policy.test.ts > support bot policy > starts a new conversation after a day of silence`
- `src/core/support-bot/support-bot-policy.test.ts > support bot policy > answers the merchant's latest message once they stopped typing`
- `src/core/support-bot/support-bot-policy.test.ts > support bot policy > stays silent after it handed the conversation over`
- `src/core/support-bot/support-bot-policy.test.ts > support bot policy > does not answer a message an hour old`
- `src/core/support-bot/support-bot-policy.test.ts > support bot policy > hands over once it answered the merchant its daily limit`
- `src/core/support-bot/support-bot-repo.test.ts > support bot repo > clones the repository into its own directory and reads the docs from it`
- `src/core/support-bot/support-bot-repo.test.ts > support bot repo > reads the code at the merchant's commit, fetching one it does not know yet`
- `src/core/support-bot/support-bot-repo.test.ts > support bot repo > falls back to the default branch for an unknown commit or a version that is not one`
- `src/core/support-bot/support-bot-repo.test.ts > support bot repo > refuses paths outside the repository and ones git could read as options`
- `src/features/settings/support/support-chat-mentions.test.ts > support chat mentions > shows the people the bot hands over to as mentions`
- `src/core/support-bot/support-bot.test.ts > support bot > reacts with 👀 to the merchant's message while it works on the answer`
- `src/core/support-bot/support-bot-policy.test.ts > support bot policy > reads no reaction as a word in the conversation, its own 👀 included`
