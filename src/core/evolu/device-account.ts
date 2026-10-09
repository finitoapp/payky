import {
  createAppOwner,
  createIdFromString,
  evoluJsonArrayFrom,
  evoluJsonObjectFrom,
  type KyselyNotNull,
  type MutationOptions,
  sqliteFalse,
  sqliteTrue,
} from "@evolu/common"

import {
  type AccountEvoluTransportId,
  type AccountId,
  createDeviceQuery,
  type DeviceEvolu,
} from "@/core/evolu/device-client.ts"
import type { DeviceId } from "@/core/modules/device/device-types.ts"
import {
  createMasterKey,
  deriveEvoluOwnerSecret,
  type MasterKey,
} from "@/core/modules/shared/key-derivation.ts"
import { NonEmptyString255, WssUrl } from "@/core/modules/shared/schema.ts"
import { createRandomDisplayName } from "@/lib/random-name.ts"

export interface DeviceAccount {
  readonly id: AccountId
  readonly masterKey: MasterKey
  readonly name: string
  readonly device: {
    readonly id: DeviceId
    readonly name: string
  } | null
  readonly transports: ReadonlyArray<{
    readonly type: "WebSocket"
    readonly url: string
  }>
}

export const activeAccountQuery = createDeviceQuery((db) =>
  db
    .selectFrom("account")
    .select((eb) => [
      "account.id as id",
      "account.masterKey as masterKey",
      "account.name as name",

      evoluJsonObjectFrom(
        eb
          .selectFrom("device")
          .select(["device.id as id", "device.name as name"])
          .where("device.isDeleted", "is not", sqliteTrue)
          .where("device.name", "is not", null)
          .$narrowType<{
            name: KyselyNotNull
          }>()
      ).as("device"),

      evoluJsonArrayFrom(
        eb
          .selectFrom("accountEvoluTransport")
          .leftJoin(
            "accountEvoluTransportWebsocket",
            "accountEvoluTransportWebsocket.id",
            "accountEvoluTransport.id"
          )
          .select([
            "accountEvoluTransport.type as type",
            "accountEvoluTransportWebsocket.url as url",
          ])
          .whereRef("accountEvoluTransport.accountId", "=", "account.id")
          .where("accountEvoluTransport.isDeleted", "is not", sqliteTrue)
          .where("accountEvoluTransport.type", "is not", null)
          .where("accountEvoluTransportWebsocket.url", "is not", null)
          .where("accountEvoluTransport.isActive", "=", sqliteTrue)
          .where(
            "accountEvoluTransportWebsocket.isDeleted",
            "is not",
            sqliteTrue
          )
          .$narrowType<{
            type: KyselyNotNull
            url: KyselyNotNull
          }>()
      ).as("transports"),
    ])
    .where("account.isDeleted", "is not", sqliteTrue)
    .where("account.masterKey", "is not", null)
    .where("account.name", "is not", null)
    .orderBy("account.lastUseAt", "desc")
    .limit(1)
    .$narrowType<{
      name: KyselyNotNull
      masterKey: KyselyNotNull
    }>()
)

/**
 * The device account under `id`, a removed one included: re-adding it
 * revives that row instead of adding a second one (account/0003).
 */
const accountByIdQuery = (id: AccountId) =>
  createDeviceQuery((db) =>
    db
      .selectFrom("account")
      .select(["account.id", "account.isDeleted"])
      .where("account.id", "=", id)
      .where("account.name", "is not", null)
  )

export const accountListQuery = createDeviceQuery((db) =>
  db
    .selectFrom("account")
    .select([
      "account.id",
      "account.name",
      "account.createdAt",
      "account.lastUseAt",
      "account.nostrPicture",
    ])
    .where("account.isDeleted", "is not", sqliteTrue)
    .where("account.name", "is not", null)
    .where("account.masterKey", "is not", null)
    .where("account.createdAt", "is not", null)
    .where("account.lastUseAt", "is not", null)
    .orderBy("account.createdAt", "asc")
    .$narrowType<{
      name: KyselyNotNull
      createdAt: KyselyNotNull
      lastUseAt: KyselyNotNull
    }>()
)

export const createAccountMasterKey = (): MasterKey => createMasterKey()

export const createRandomAccountName = () =>
  NonEmptyString255(createRandomDisplayName())

/**
 * Stands in for the active account's app owner id inside a stored transport
 * URL, so a relay that addresses a room by path can be configured without
 * knowing which account will use it. `resolveTransportUrl` substitutes it
 * before the URL is dialed; the stored row keeps the placeholder.
 *
 * The owner id is what every relay already routes this account's messages by,
 * and it is a 22-character Base64Url string — exactly the letters, digits,
 * `-` and `_` a room id may contain — so it needs no escaping.
 */
// biome-ignore lint/suspicious/noTemplateCurlyInString: the literal `${appOwnerId}` is the stored syntax, not an interpolation that lost its backticks.
export const appOwnerIdPlaceholder = "${appOwnerId}"

/**
 * Matches the placeholder both as written and percent-encoded, because a URL
 * that has been through `new URL()` carries `$%7BappOwnerId%7D` instead. An
 * unsubstituted placeholder would put every account in one shared room, which
 * is worth two forms in one regex to rule out.
 */
const appOwnerIdPlaceholderPattern = /\$(?:\{appOwnerId\}|%7BappOwnerId%7D)/giu

export const resolveTransportUrl = (url: string, appOwnerId: string): WssUrl =>
  WssUrl(url.replace(appOwnerIdPlaceholderPattern, appOwnerId))

export const defaultEvoluTransportUrls = [
  WssUrl("wss://evolu.linky.fit"),
  WssUrl(`wss://live-relay.payky.me/${appOwnerIdPlaceholder}`),
] as const

const createAccountEvoluTransportId = ({
  accountId,
  type,
  url,
}: {
  readonly accountId: AccountId
  readonly type: "WebSocket"
  readonly url: WssUrl
}): AccountEvoluTransportId =>
  createIdFromString<"DeviceAccountEvoluTransportId">(
    JSON.stringify({ accountId, type, url })
  )

export const upsertAccountEvoluWebsocketTransport = (
  deviceEvolu: DeviceEvolu,
  {
    accountId,
    isActive,
    url,
  }: {
    readonly accountId: AccountId
    readonly isActive: typeof sqliteFalse | typeof sqliteTrue
    readonly url: WssUrl
  },
  options?: MutationOptions
): AccountEvoluTransportId => {
  const id = createAccountEvoluTransportId({
    accountId,
    type: "WebSocket",
    url,
  })

  deviceEvolu.upsert(
    "accountEvoluTransport",
    {
      id,
      accountId,
      type: "WebSocket",
      isActive,
    },
    options
  )
  deviceEvolu.upsert(
    "accountEvoluTransportWebsocket",
    {
      id,
      url,
    },
    options
  )

  return id
}

/**
 * What an account brought from another device keeps: its name, and its
 * transports in their stored form, so one on a custom sync server syncs here
 * too. Without them the account gets a random name and the defaults.
 */
export interface NewAccountOptions {
  readonly name?: NonEmptyString255 | undefined
  readonly transports?: ReadonlyArray<WssUrl> | undefined
}

/**
 * A device account's id, the same on every device and every time the
 * account is added, so adding it twice — even in two concurrent calls —
 * writes one row (account/0003). Derived from the app owner id, which sync
 * URLs carry anyway, not from the master key: the id may end up in logs.
 */
export const deriveDeviceAccountId = (masterKey: MasterKey): AccountId =>
  createIdFromString<"DeviceAccountId">(
    `payky-device-account:${createAppOwner(deriveEvoluOwnerSecret(masterKey)).id}`
  )

export const insertAccount = (
  deviceEvolu: DeviceEvolu,
  masterKey: MasterKey,
  options: NewAccountOptions = {}
): DeviceAccount => {
  const name = options.name ?? createRandomAccountName()
  const transportUrls =
    options.transports !== undefined && options.transports.length > 0
      ? options.transports
      : defaultEvoluTransportUrls
  const accountId = deriveDeviceAccountId(masterKey)
  deviceEvolu.upsert("account", {
    id: accountId,
    name,
    masterKey,
    lastUseAt: Date.now(),
    isDeleted: sqliteFalse,
  })
  for (const url of transportUrls) {
    upsertAccountEvoluWebsocketTransport(deviceEvolu, {
      accountId,
      isActive: sqliteTrue,
      url,
    })
  }

  return {
    id: accountId,
    masterKey,
    name,
    device: null,
    // Mirrors what the upserts above wrote, so the account syncs in the
    // session that created it rather than only after the next reload.
    transports: transportUrls.map((url) => ({
      type: "WebSocket" as const,
      url,
    })),
  }
}

export async function loadActiveAccountRow(deviceEvolu: DeviceEvolu) {
  const data = await deviceEvolu.loadQuery(activeAccountQuery)
  return data[0] ?? null
}

/**
 * Selects the account `masterKey` belongs to, reviving it if it was removed,
 * or adds it. An account already stored keeps its name and transports; one
 * that was removed counts as `created`, since it was not on the device.
 * Every account sits at its derived id, rows from before moved there by
 * `deviceAccountDerivedIdMigration`.
 */
export async function createOrSelectAccount(
  deviceEvolu: DeviceEvolu,
  masterKey: MasterKey,
  options?: NewAccountOptions
): Promise<{ readonly accountId: AccountId; readonly created: boolean }> {
  const [existingAccount] = await deviceEvolu.loadQuery(
    accountByIdQuery(deriveDeviceAccountId(masterKey))
  )

  if (existingAccount !== undefined) {
    const removed = existingAccount.isDeleted === sqliteTrue
    deviceEvolu.update("account", {
      id: existingAccount.id,
      lastUseAt: Date.now(),
      ...(removed ? { isDeleted: sqliteFalse } : {}),
    })
    return { accountId: existingAccount.id, created: removed }
  }

  const account = insertAccount(deviceEvolu, masterKey, options)
  return { accountId: account.id, created: true }
}

export function selectAccount(
  deviceEvolu: DeviceEvolu,
  accountId: AccountId,
  options?: MutationOptions
) {
  deviceEvolu.update(
    "account",
    {
      id: accountId,
      lastUseAt: Date.now(),
    },
    options
  )
}

export function updateAccountName(
  deviceEvolu: DeviceEvolu,
  accountId: AccountId,
  name: string,
  options?: MutationOptions
) {
  deviceEvolu.update(
    "account",
    {
      id: accountId,
      name: NonEmptyString255(name),
    },
    options
  )
}

const NOSTR_PICTURE_MAX_LENGTH = 2048

/**
 * What of an account's Nostr picture its device row keeps: an https URL of
 * sane length. A `data:` picture is left out, so the device database does not
 * grow by whole images; the account then shows its initial.
 */
export const storableNostrPicture = (picture: string | null): string | null => {
  if (picture === null) return null
  return picture.startsWith("https://") &&
    picture.length <= NOSTR_PICTURE_MAX_LENGTH
    ? picture
    : null
}

export function updateAccountNostrPicture(
  deviceEvolu: DeviceEvolu,
  accountId: AccountId,
  picture: string | null
) {
  deviceEvolu.update("account", { id: accountId, nostrPicture: picture })
}

export function removeDeviceAccount(
  deviceEvolu: DeviceEvolu,
  accountId: AccountId
) {
  deviceEvolu.update("account", {
    id: accountId,
    isDeleted: sqliteTrue,
  })
}
