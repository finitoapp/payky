import { createIdFromString } from "@evolu/common"

/**
 * The Qerko plugin is a singleton, like the Fio plugin: one pairing per
 * account, so its id is fixed rather than generated. A missing or deleted row
 * means the terminal is not paired.
 */
export const qerkoPluginId =
  createIdFromString<"QerkoPlugin">("payky-qerko-plugin")
