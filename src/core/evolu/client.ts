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
 * Config fields callers may set. `appOwner`, `appName`, and `indexes` are
 * owned by this factory.
 */
type AppEvoluConfig = Omit<EvoluConfig, "appOwner" | "appName" | "indexes">
type AppEvoluAccountConfig = AppEvoluConfig & {
  readonly mnemonic: Mnemonic
  readonly transports: NonNullable<EvoluConfig["transports"]>
}

const createAppEvoluWithOwner = (appOwner: AppOwner, config: AppEvoluConfig) =>
  createEvolu(AppSchema, {
    ...config,
    appName: AppName.orThrow("Payky"),
    appOwner,
    indexes: createAppIndexes,
  })

export const createAppEvolu = ({
  mnemonic,
  ...config
}: AppEvoluAccountConfig) =>
  createAppEvoluWithOwner(
    createAppOwner(mnemonicToOwnerSecret(mnemonic)),
    config
  )

/**
 * App Evolu owned by the publicly known Evolu test owner. Only for tests and
 * the CLI, which has no owner identity yet — never for the app itself.
 */
export const createTestAppEvolu = (config: AppEvoluConfig = {}) =>
  createAppEvoluWithOwner(testAppOwner, { transports: [], ...config })
