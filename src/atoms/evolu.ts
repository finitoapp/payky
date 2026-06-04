import { sqliteTrue } from "@evolu/common"
import { createEvoluDeps, createRun } from "@evolu/web"
import { generateMnemonic } from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english.js"
import { atom } from "jotai"
import { accountAtom } from "@/atoms/account.ts"
import { createAppEvolu } from "@/core/evolu/client.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import {
  cashRegisterAccountId,
  sparkAccountId,
} from "@/core/modules/account/account-utils.ts"
import {
  createDefaultSettings,
  settingsId,
} from "@/core/modules/app-settings/app-settings-utils.ts"
import {
  FiatCurrency,
  NonEmptyString255,
} from "@/core/modules/shared/schema.ts"

export const evoluAtom = atom(async (get) => {
  const account = await get(accountAtom)
  const run = createRun(createEvoluDeps())
  const evolu = await run.orThrow(
    createAppEvolu({
      mnemonic: account.mnemonic,
      transports: account.transports,
    })
  )
  const deviceId = account.device.id

  // Seed initial data
  const deviceData = await evolu.loadQuery(
    createQuery((db) =>
      db
        .selectFrom("device")
        .selectAll()
        .where("isDeleted", "is not", sqliteTrue)
        .where("id", "=", account.device.id)
    )
  )
  if (deviceData.length === 0) {
    evolu.upsert("device", account.device)
  }

  const appOwner = await evolu.appOwner
  if (appOwner.mnemonic === null || appOwner.mnemonic === undefined)
    throw new Error(
      "App owner mnemonic is not set. Please create a new account."
    )

  // Create default accounts and payment methods
  {
    const appSettings = await evolu.loadQuery(
      createQuery((db) =>
        db.selectFrom("appSettings").select("id").where("id", "=", settingsId)
      )
    )

    if (appSettings.length === 0) {
      evolu.upsert("appSettings", createDefaultSettings())
    }

    const sparkAccount = await evolu.loadQuery(
      createQuery((db) =>
        db
          .selectFrom("account")
          .selectAll()
          .where("isDeleted", "is not", sqliteTrue)
          .where("id", "=", sparkAccountId)
      )
    )

    if (sparkAccount.length === 0) {
      const mnemonic = generateMnemonic(wordlist, 128)
      evolu.upsert("account", {
        id: sparkAccountId,
        deviceId,
        name: NonEmptyString255("Default"),
        kind: "spark",
      })
      evolu.upsert("accountSpark", {
        id: sparkAccountId,
        mnemonic: NonEmptyString255(mnemonic),
      })
    }

    const cashRegisterAccount = await evolu.loadQuery(
      createQuery((db) =>
        db
          .selectFrom("account")
          .selectAll()
          .where("isDeleted", "is not", sqliteTrue)
          .where("id", "=", cashRegisterAccountId)
      )
    )

    if (cashRegisterAccount.length === 0) {
      evolu.upsert("account", {
        id: cashRegisterAccountId,
        deviceId,
        name: NonEmptyString255("Cash Register"),
        kind: "cashRegister",
      })
      evolu.upsert("accountCashRegister", {
        id: cashRegisterAccountId,
        currency: FiatCurrency.CZK,
      })
    }
  }

  return evolu
})
