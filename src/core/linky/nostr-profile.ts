import {
  deriveDefaultProfile,
  normalizeProfileName,
} from "@linky/profile-defaults"
import { z } from "zod"

/** What the settings card shows about the account's Nostr profile. */
export interface NostrProfile {
  readonly name: string
  readonly pictureUrl: string | null
  /** `published`: kind-0 metadata found on a relay; `generated`: Linky's deterministic fallback. */
  readonly source: "published" | "generated"
}

const ProfileMetadataSchema = z.looseObject({
  name: z.string().optional(),
  display_name: z.string().optional(),
  displayName: z.string().optional(),
  picture: z.string().optional(),
})

const isDisplayablePictureUrl = (value: string): boolean => {
  const trimmed = value.trim()
  if (trimmed.startsWith("data:image/")) return true
  try {
    const url = new URL(trimmed)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

/**
 * Name and picture from a kind-0 event's content, resolved as Linky does:
 * `display_name` before `name`, both normalized, and only a URL the browser
 * can render as a picture.
 */
export const parseProfileMetadata = (
  content: string
): {
  readonly name: string | null
  readonly pictureUrl: string | null
} | null => {
  let json: unknown
  try {
    json = JSON.parse(content)
  } catch {
    return null
  }
  const parsed = ProfileMetadataSchema.safeParse(json)
  if (!parsed.success) return null

  const displayName = normalizeProfileName(
    parsed.data.display_name ?? parsed.data.displayName ?? ""
  )
  const name = normalizeProfileName(parsed.data.name ?? "")
  const picture = parsed.data.picture ?? ""

  return {
    name: displayName || name || null,
    pictureUrl: isDisplayablePictureUrl(picture) ? picture.trim() : null,
  }
}

export type ProfileLang = "cs" | "de" | "en"

/**
 * The profile for `pubkey`: the newest kind-0 event any of `relays` holds,
 * else the generated defaults Linky shows for an account that never
 * published one — same name list, same avatar seed.
 */
export const fetchNostrProfile = async ({
  pubkey,
  npub,
  relays,
  lang,
  signal,
}: {
  readonly pubkey: string
  readonly npub: string
  readonly relays: ReadonlyArray<string>
  readonly lang: ProfileLang
  readonly signal?: AbortSignal
}): Promise<NostrProfile> => {
  const generated = deriveDefaultProfile(npub, lang === "de" ? "en" : lang)
  const fallback: NostrProfile = {
    name: generated.name,
    pictureUrl: generated.pictureUrl,
    source: "generated",
  }

  const { SimplePool } = await import("nostr-tools/pool")
  const pool = new SimplePool()
  try {
    const event = await pool.get(
      [...relays],
      { kinds: [0], authors: [pubkey] },
      { maxWait: 6_000 }
    )
    if (signal?.aborted || event === null) return fallback

    const metadata = parseProfileMetadata(event.content)
    if (metadata === null) return fallback

    return {
      name: metadata.name ?? fallback.name,
      pictureUrl: metadata.pictureUrl ?? fallback.pictureUrl,
      source: "published",
    }
  } catch {
    return fallback
  } finally {
    pool.close([...relays])
  }
}
