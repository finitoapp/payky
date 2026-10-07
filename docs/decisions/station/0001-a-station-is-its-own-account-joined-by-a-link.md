# 0001 A station is its own account, joined by a link whose fragment carries its keys

Status: accepted
Date: 2026-10-07

## Context

A merchant wants more than one device taking payments, each run by staff who
must not see the owner's money, settings or recovery phrase. Payky already
derives everything an account has (its Evolu database, its Nostr key, its
Spark wallet) from one 16-byte master key.

## Decision

The owner creates a PoS station with 16 random bytes of its own. The station
is opened on another device through `/pos#<fragment>`, where the fragment is
base64url of a version byte, the station's entropy and the owner's 32-byte
comms pubkey (station/0002). Opening it adds a device account of kind
`station` keyed by that entropy, so the station gets its own Evolu, Nostr key
and Spark wallet through the usual derivations. Opening the same link again
selects the account it made before.

## Alternatives considered

Sharing the owner's Evolu with the station device. Staff would then hold
every owner secret and all history. A pairing handshake over Nostr instead of
the owner pubkey in the link: more moving parts, and the station would have
to trust whoever answered first.

## Consequences

The secret lives in the URL fragment, which browsers never send to a server,
but anyone holding the link is the station. The owner keeps the entropy to
show the link again. One link belongs on one device: two devices with the
same link fork the report chain (station/0004).

## Enforced by

- `src/core/modules/station/station-link-utils.test.ts > station link > carries the station's keys in the fragment, never the path`
- `src/core/modules/station/station-link-utils.test.ts > station link > refuses a fragment that is not a station link`
- `src/core/evolu/device-account.test.ts > createOrSelectStationAccount > opens a station as an account of its own, trusting its owner`
- `src/core/evolu/device-account.test.ts > createOrSelectStationAccount > selects the account a link made before`
