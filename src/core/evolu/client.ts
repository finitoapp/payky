import { AppName, createEvolu, testAppOwner } from "@evolu/common"

import { AppSchema, createAppIndexes } from "@/core/evolu/schema.ts"

export const createAppEvolu = () =>
  createEvolu(AppSchema, {
    appName: AppName.orThrow("Payky"),
    appOwner: testAppOwner,
    indexes: createAppIndexes,
    transports: [],
  })
