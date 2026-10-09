import { pbkdf2Async } from "@noble/hashes/pbkdf2.js"
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex, hexToBytes, randomBytes } from "@noble/hashes/utils.js"
import { z } from "zod"

import {
  type Permission,
  PermissionSchema,
  permissions,
} from "@/core/modules/access/access-types.ts"
import { normalizeMnemonic } from "@/core/modules/account/account-utils.ts"
import {
  type MasterKey,
  mnemonicToMasterKey,
  RecoveryMnemonicSchema,
} from "@/core/modules/shared/key-derivation.ts"
import { jsonCodec } from "@/zod-utils.ts"

/** The owner PIN: 4–8 digits (access/0001). */
export const PinSchema = z
  .string()
  .regex(/^\d{4,8}$/u)
  .brand<"Pin">()
export type Pin = z.output<typeof PinSchema>

/**
 * One PIN is hashed once per entry, so the count can be high; it is not what
 * protects a 4–8 digit PIN anyway (see access/0001).
 * ponytail: tuned by guess for ~300 ms on low-end Android; measure on the
 * cheapest supported device and adjust (stored rows keep their own count).
 */
export const pinHashIterations = 30_000

/**
 * The stored PIN. Bounded because it syncs: an iteration count of 10⁹
 * written by one device would freeze every device that verifies a PIN, so a
 * value outside the bounds fails to decode and counts as no PIN.
 */
const PinHashSchema = z.object({
  salt: z
    .string()
    .regex(/^[0-9a-f]+$/u)
    .min(32)
    .max(128),
  iterations: z.number().int().min(1000).max(300_000),
  hash: z.string().regex(/^[0-9a-f]{64}$/u),
})
export type PinHash = z.output<typeof PinHashSchema>
export const PinHashJson = jsonCodec(PinHashSchema)

const derive = async (
  pin: string,
  salt: string,
  iterations: number
): Promise<string> =>
  bytesToHex(
    await pbkdf2Async(sha256, pin, hexToBytes(salt), {
      c: iterations,
      dkLen: 32,
    })
  )

export const hashPin = async (pin: Pin): Promise<PinHash> => {
  const salt = bytesToHex(randomBytes(16))
  return {
    salt,
    iterations: pinHashIterations,
    hash: await derive(pin, salt, pinHashIterations),
  }
}

/** `null` when the stored value does not decode: there is no PIN to match. */
export const decodePinHash = (stored: string | null): PinHash | null => {
  if (stored === null) return null
  const decoded = z.safeDecode(PinHashJson, stored)
  return decoded.success ? decoded.data : null
}

export const verifyPin = async (
  pin: string,
  stored: PinHash
): Promise<boolean> =>
  (await derive(pin, stored.salt, stored.iterations)) === stored.hash

/** A device's default permissions as stored in `device.defaultPermissions`. */
export const PermissionsJson = jsonCodec(z.array(PermissionSchema))

/** `null`, or anything that does not decode, is no permissions (rule 3). */
export const decodePermissions = (
  stored: string | null
): ReadonlySet<Permission> => {
  if (stored === null) return new Set()
  const decoded = z.safeDecode(PermissionsJson, stored)
  return new Set(decoded.success ? decoded.data : [])
}

/** Kept in the canonical order, so equal sets store equal strings. */
export const encodePermissions = (
  granted: Iterable<Permission>
): string | null => {
  const set = new Set(granted)
  return set.size === 0
    ? null
    : z.encode(
        PermissionsJson,
        permissions.filter((permission) => set.has(permission))
      )
}

/**
 * What the device may do right now (rule 5): everything while access control
 * is off or a PIN session runs, its defaults otherwise.
 */
export const effectivePermissions = ({
  enabled,
  defaults,
  session,
}: {
  readonly enabled: boolean
  readonly defaults: ReadonlySet<Permission>
  readonly session: boolean
}): ReadonlySet<Permission> =>
  !enabled || session ? new Set(permissions) : defaults

/**
 * Whether a typed recovery phrase belongs to the account (rule 8): decoded
 * into a master key the way restoring decodes it, and compared as keys, so
 * the check does not depend on `masterKeyToMnemonic` reproducing the exact
 * string the owner wrote down.
 */
export const recoveryPhraseMatches = async (
  phrase: string,
  masterKey: MasterKey
): Promise<boolean> => {
  const parsed = RecoveryMnemonicSchema.safeParse(
    normalizeMnemonic(phrase).toLowerCase()
  )
  if (!parsed.success) return false
  try {
    return (await mnemonicToMasterKey(parsed.data)) === masterKey
  } catch {
    // A phrase of valid words whose checksum fails is just a wrong phrase.
    return false
  }
}
