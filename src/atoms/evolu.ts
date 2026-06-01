import { createIdFromString, sqliteTrue } from "@evolu/common"
import { createEvoluDeps, createRun } from "@evolu/web"
import { sha256 } from "@noble/hashes/sha2.js"
import { atom } from "jotai"
import { accountAtom } from "@/atoms/account.ts"
import { createAppEvolu } from "@/core/evolu/client.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import {
  createDefaultSettings,
  settingsId,
} from "@/core/modules/app-settings/app-settings-utils.ts"
import {
  FiatCurrency,
  NonEmptyString255,
} from "@/core/modules/shared/schema.ts"

export const evoluAtom = atom(async (get) => {
  console.log("ok1")
  const account = await get(accountAtom)
  const run = createRun(createEvoluDeps())
  const evolu = await run.orThrow(
    createAppEvolu({
      mnemonic: account.mnemonic,
      transports: account.transports,
    })
  )
  const deviceId = account.device.id

  console.log("deviceId", deviceId)
  // Seed initial data
  ;(async () => {
    // Copy device identification to the shared evolu instance. Skip waiting
    void (async () => {
      const data = await evolu.loadQuery(
        createQuery((db) =>
          db
            .selectFrom("device")
            .selectAll()
            .where("isDeleted", "is not", sqliteTrue)
            .where("id", "=", account.device.id)
        )
      )
      if (data.length === 0) {
        evolu.upsert("device", account.device)
      }
    })()

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
        console.log("Creating default settings", createDefaultSettings())
        evolu.upsert("appSettings", createDefaultSettings())
        console.log("Creating default settings2", createDefaultSettings())
      }

      const msgBuffer = new TextEncoder().encode(appOwner.mnemonic)
      const hashBuffer = sha256(msgBuffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const sparkAccountId = createIdFromString<"Account">(
        hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
      )
      const cashRegisterAccountId = createIdFromString<"Account">(
        `${sparkAccountId}:cashRegister`
      )

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
        evolu.upsert("account", {
          id: sparkAccountId,
          deviceId,
          name: NonEmptyString255("Default"),
          kind: "spark",
        })
        evolu.upsert("accountSpark", {
          id: sparkAccountId,
          mnemonic: NonEmptyString255(appOwner.mnemonic),
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
  })()

  return evolu
})
