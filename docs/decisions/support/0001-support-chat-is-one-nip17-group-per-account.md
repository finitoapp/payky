# 0001 The support chat is one NIP-17 group per account

Status: accepted
Date: 2026-10-02

## Context

Merchants need to reach Payky's support from the app, and the support team
is several people. Whoever writes or replies, everyone has to see the whole
conversation: the merchant and every other support member. Payky has no
backend of its own for this and already talks Nostr. The support team works
in Amethyst, which shows a NIP-17 message whose rumor tags several
recipients as a group named by the set of its members, delivers a reply to
each member's kind 10050 DM relays, and does not copy a `subject` or any
custom tag into a reply. NIP-17 has a sender deliver only to the
recipient's kind 10050 relays, with no fallback. The account's Nostr key is
also Linky's, so every DM the merchant has in Linky arrives at the same key,
and Linky publishes that key's 10050 list.

## Decision

The support team comes from Payky's API (`/api/support-team`), configured in
the server's `PAYKY_SUPPORT_NPUBS`, `PAYKY_SUPPORT_FORMER_TEAMS` and
`PAYKY_SUPPORT_RELAYS`, so it changes with a deploy instead of an app
release. It names the current members, every former line-up and the support
relays. The app has no list of its own to fall back on: when the API does not
answer, the chat says support is unavailable and offers a retry, and nothing
can be sent. Every support member lists one of the support relays as a DM
relay in Amethyst; that is an operating rule of the team, so the app never
looks up the members' own lists. The chat uses the account's own
Nostr key, so support sees the merchant's profile. A message from the app is
one kind 14 rumor tagging every support npub, gift-wrapped to each of them
and to the account itself, so the group's members are the account plus the
support team and each account is its own room. The rumor carries a
`subject` with the account's profile name, which Amethyst shows as the
group's name.

A message belongs to the chat only when its room, the author and every `p`
tag, is exactly the account plus the current team or one of the former
line-ups. That is the one thing a reply from Amethyst always carries, and it
leaves out the merchant's other DMs, including a 1:1 with a single member of
a larger team. Messages go to the current team only. With one support npub
the room is a 1:1 with it, so a DM with that npub from Linky is part of the
chat too. When the team changes, its line-up until then is appended to the
former teams; a list of former members alone would not do, because a member
who stays, such as the only one of a team that grows, is in no former list
and the old room would drop out.

Every outgoing message ends with a trailer naming the app version and the
platform, so support knows what they are helping with. The app hides the
trailer in its own view.

A send succeeds only when a relay accepted a copy for support, and the
account's own copy is published only after that, so every message of the
account in the history reached a relay for support; the app marks it sent
with a tick. Whether a member's client fetched or read it, NIP-17 does not
say and Amethyst does not report, so the app shows neither. Every copy for
support goes to the support relays.

Amethyst delivers the replies to the account's 10050 relays, so the chat
reads from those and from the support relays. The app never changes an
existing 10050 list, since Linky owns it too. Only an account that has none
gets one, naming the support relays, on its first send, and only when every
relay asked, the app's, the profile indexers and the support relays, answered
in time without one.

A received gift wrap counts only when the seal's signature is valid, the
seal and the rumor share their author and the rumor's id is its hash. The
chat loads the last ninety days when it opens and listens for new messages
while it is open.

## Alternatives considered

One npub whose key the whole support team shares, which was rejected
because every member should answer as themselves.

A bot or relay that fans messages out, which was rejected because NIP-17
groups already do it without a server.

A key of its own for the chat, derived from the recovery phrase, which was
rejected because support then sees no profile and every message has to name
the account's npub.

The team built into the app, which was rejected because changing it took an
app release. A built-in team as the fallback when the API is down, which was
rejected so that a team that was changed is never written to again.

Signing the team's list with an offline key pinned in the app, which was
rejected for now: the API is trusted as far as the deploy is, as the web app
already is.

Telling the chat's messages apart by a `subject` or a custom tag, which was
rejected because Amethyst's replies carry neither.

Adding the app's relays to an existing 10050 list, which was rejected because
a list the relays did not return in time looked missing, and replacing it
dropped Linky's relays for good.

Support relays alone, without publishing any 10050, which do not work: an
account without a list gets no replies, because Amethyst only delivers to
one.

`nip17.wrapManyEvents` from nostr-tools, which was rejected because it tags
each copy with its own recipient only, so every member would get a separate
1:1 chat.

## Consequences

Linky shows the same messages. With one support npub that is a plain 1:1
chat there, and a reply from Linky lands in Payky's chat. With several, Linky
splits the group into a 1:1 chat per member and its replies reach only one
of them.

An account that has a 10050 list only on relays that did not answer is
treated as having none and gets a new one, which then replaces it. Changing
the team makes a new room in Amethyst, where the old conversation stays
apart; the app keeps showing it as long as its line-up is among the former
teams. Whoever controls the deploy decides who the merchants' messages go to.
Without the API the chat cannot be used, not even to read. Every message costs
one gift wrap per support member plus one. Opening the chat decrypts every
DM the account received in the last ninety days, Linky's included, because
nothing else tells whose a gift wrap is; older messages are not shown. There
is no unread state and no push notification.

## Enforced by

- `src/core/integrations/nostr/nostr-support-chat.test.ts > support chat > sends one rumor tagged with every support member to each of them and to the account`
- `src/core/integrations/nostr/nostr-support-chat.test.ts > support chat > sends support's copies to the team's relays and the account's to where it reads`
- `src/core/integrations/nostr/nostr-support-chat.test.ts > support chat > publishes DM relays naming the team's relays for an account without any`
- `src/core/integrations/nostr/nostr-support-chat.test.ts > support chat > never changes an account's existing DM relay list`
- `src/core/integrations/nostr/nostr-support-chat.test.ts > support chat > reads the account's newest DM relays from the app's relays, the indexers and the team's`
- `src/core/integrations/nostr/nostr-support-chat.test.ts > support chat > reports a missing DM relay list only when every relay answered in time`
- `src/core/integrations/nostr/nostr-support-chat.test.ts > support chat > fails without publishing the account's own copy when no copy reached support`
- `src/core/integrations/nostr/nostr-support-chat.test.ts > support chat > reads a reply from one member beside the account's message, without its trailer`
- `src/core/integrations/nostr/nostr-support-chat.test.ts > support chat > drops a message whose seal was signed by someone else than its author`
- `src/core/integrations/nostr/nostr-support-chat.test.ts > support chat > ignores a 1:1 with a single member of the support team`
- `src/core/integrations/nostr/nostr-support-chat.test.ts > support chat > keeps a former team's room in the chat once the team has grown`
- `src/core/integrations/nostr/support-team-client.test.ts > support team client > reads the team from Payky's API with its npubs as hex pubkeys`
- `src/core/integrations/nostr/support-team-client.test.ts > support team client > rejects a team with something other than an npub`
- `api/support-team.test.ts > handleSupportTeamRequest > serves the team with its former line-ups and relays, cached for five minutes`
- `src/core/integrations/nostr/nostr-support-chat.test.ts > support chat > ignores direct messages from outside the support team`
- `src/core/integrations/nostr/nostr-support-chat.test.ts > support chat > loads the last ninety days from the team's relays and the account's DM inbox`
- `src/core/integrations/nostr/nostr-support-chat.test.ts > support chat > signs every message with the app version and platform`
