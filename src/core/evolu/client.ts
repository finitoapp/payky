import {
  AppName,
  createAppOwner,
  createEvolu,
  type EvoluConfig,
  type Mnemonic,
  mnemonicToOwnerSecret,
  testAppOwner,
} from "@evolu/common"
import { AppSchema, createAppIndexes } from "@/core/evolu/schema.ts"

export const createAppEvolu = (
  config: Omit<EvoluConfig, "appOwner" | "appName"> & {
    mnemonic?: Mnemonic
  } = {}
) =>
  createEvolu(AppSchema, {
    ...config,
    appName: AppName.orThrow("Payky"),
    appOwner: config.mnemonic
      ? createAppOwner(mnemonicToOwnerSecret(config.mnemonic))
      : testAppOwner,
    indexes: createAppIndexes,
    transports: [],
  })
