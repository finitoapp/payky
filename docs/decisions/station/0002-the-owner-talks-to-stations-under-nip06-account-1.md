# 0002 The owner talks to stations under NIP-06 account 1

Status: accepted
Date: 2026-10-07

## Context

The account's NIP-06 account 0 key is shared with Linky and the support chat,
and it is the merchant's public profile key.

## Decision

The owner signs and receives station messages with the key at
`m/44'/1237'/1'/0/0` of its master key. Every owner device derives the same
key, so any of them can serve the stations.

## Alternatives considered

Account 0. Every DM and support message would land in the station
subscription and have to be decrypted, Linky might try to show station
messages, and station traffic would be tied to the merchant's profile.

## Consequences

The owner's comms pubkey is part of every station link (station/0001). A
station never needs the owner's profile key.

## Enforced by

- `src/core/modules/shared/key-derivation.test.ts > key derivation > talks to stations under NIP-06 account 1, apart from the account's own Nostr key`
