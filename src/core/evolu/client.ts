import {
  AppName,
  type AppOwner,
  createAppOwner,
  createEvolu,
  type EvoluConfig,
  testAppOwner,
} from "@evolu/common"
import { AppSchema, createAppIndexes } from "@/core/evolu/schema.ts"
import {
  deriveEvoluOwnerSecret,
  type MasterKey,
} from "@/core/modules/shared/key-derivation.ts"

/**
 * Config fields callers may set. `appOwner`, `appName`, and `indexes` are
 * owned by this factory.
 */
type AppEvoluConfig = Omit<EvoluConfig, "appOwner" | "appName" | "indexes">
type AppEvoluAccountConfig = AppEvoluConfig & {
  readonly masterKey: MasterKey
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
  masterKey,
  ...config
}: AppEvoluAccountConfig) =>
  createAppEvoluWithOwner(
    createAppOwner(deriveEvoluOwnerSecret(masterKey)),
    config
  )

/**
 * App Evolu owned by the publicly known Evolu test owner. Only for tests and
 * the CLI, which has no owner identity yet — never for the app itself.
 */
export const createTestAppEvolu = (config: AppEvoluConfig = {}) =>
  createAppEvoluWithOwner(testAppOwner, { transports: [], ...config })
