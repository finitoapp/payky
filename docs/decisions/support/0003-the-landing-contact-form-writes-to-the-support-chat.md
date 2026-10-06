# 0003 The landing page's contact form writes a Nostr chat message

Status: accepted
Date: 2026-10-06

## Context

The landing page ends with an offer of help: a merchant who is not sure
yet, or who wants help setting up, leaves a way to reach them and the team
calls or writes back. Payky has no mailbox, no CRM and no backend of its
own that keeps state; what it has is a team reading NIP-17 chats in
Amethyst (support/0001) and an API that already serves that team's relays.
A visitor of the landing page has no Nostr key the team could answer to.
While the form is being tried out, its messages should go to one test
account rather than to the support team.

## Decision

The landing page's form posts to `/api/contact`, which sends the message as
one NIP-17 chat message to every npub in `PAYKY_CONTACT_NPUBS`, over the
support team's relays, exactly as the app's support chat does: one kind 14
rumor tagging every recipient, sealed and wrapped for each of them. The
default recipient is the test npub
`npub1rfqkezd7zzrxlk8hfg7vmnfed6yyt0muj2qwg36xmt2c9y9vatgsp6eupe`; a
deploy with the variable set points the form at the support team. The key
the message is sent from is generated for that one message and discarded,
so the server holds no key and nothing is stored anywhere but on the
relays.

The contact is the point of the form: the sender picks email or phone and
gives one, which is required. A message, the business and its place are
optional and come after. All of it goes into the one chat message, the
contact first, with the page's language so the team answers in it. The
rumor's `subject` names the business when one was given, else the contact,
which Amethyst shows as the chat's name.

The request succeeds once one relay accepted a copy for one recipient, as
a chat message does; otherwise the form says the message did not get
through and keeps what was typed. The form carries a honeypot field it
never shows; a request that fills it is answered as if sent and sends
nothing. There is no rate limit and no captcha.

## Alternatives considered

Email through a transactional provider, which was rejected because it adds
a provider, a key and an inbox for a team that already reads its chats.

A `mailto:` link, which was rejected because it opens whatever mail client
the device has, often none on a phone, and loses the structured contact
details.

Storing the messages in a database for the team to read, which was
rejected because Payky's API keeps no state (ai/0001).

A key of Payky's own on the server, so every form message would come from
one sender, which was rejected: a leaked server key would let anyone write
to the team as Payky, and one key per message gives Amethyst a separate
chat per message anyway, which is what the team wants.

A message without any contact, which was rejected because nobody can
reply to the message's key, so a message with no contact is one the team
can only read.

## Consequences

Each message is a new chat in Amethyst with a stranger, named by the
subject; the team cannot reply there and uses the email or phone the
sender left. Anyone can post to the endpoint, so a flood of messages is a
flood of chats; the honeypot stops only the simplest bots. A message costs
one gift wrap per recipient. The relays have to accept events from a key
they have never seen. Until `PAYKY_CONTACT_NPUBS` is set, every message
goes to the test npub, not to the support team.

## Enforced by

- `api/contact.test.ts > handleContactRequest > sends the message as one rumor tagging every recipient, wrapped for each, to the relays`
- `api/contact.test.ts > handleContactRequest > uses a fresh key for every message`
- `api/contact.test.ts > handleContactRequest > reports when no relay accepted a copy`
- `api/contact.test.ts > handleContactRequest > drops a message that fills the honeypot, answering as if sent`
- `api/contact.test.ts > handleContactRequest > rejects a body with %s`
- `src/core/modules/contact/contact-message.test.ts > formatContactMessage > puts how to reach the sender above the message`
- `src/core/modules/contact/contact-message.test.ts > ContactMessageSchema > requires an email or a phone`
