import {
  AppName,
  type AppOwner,
  createAppOwner,
  createEvolu,
  type EvoluConfig,
  type Mnemonic,
  mnemonicToOwnerSecret,
  testAppOwner,
} from "@evolu/common"
import { AppSchema, createAppIndexes } from "@/core/evolu/schema.ts"

/**
 * Config fields callers may set. `appOwner`, `indexes`, and `transports` are
 * owned by this factory; sync transports are intentionally not wired up yet.
 */
type AppEvoluConfig = Omit<
  EvoluConfig,
  "appOwner" | "appName" | "indexes" | "transports"
>

const createAppEvoluWithOwner = (appOwner: AppOwner, config: AppEvoluConfig) =>
  createEvolu(AppSchema, {
    ...config,
    appName: AppName.orThrow("Payky"),
    appOwner,
    indexes: createAppIndexes,
    transports: [],
  })

export const createAppEvolu = ({
  mnemonic,
  ...config
}: AppEvoluConfig & { readonly mnemonic: Mnemonic }) =>
  createAppEvoluWithOwner(
    createAppOwner(mnemonicToOwnerSecret(mnemonic)),
    config
  )

/**
 * App Evolu owned by the publicly known Evolu test owner. Only for tests and
 * the CLI, which has no owner identity yet — never for the app itself.
 */
export const createTestAppEvolu = (config: AppEvoluConfig = {}) =>
  createAppEvoluWithOwner(testAppOwner, config)
