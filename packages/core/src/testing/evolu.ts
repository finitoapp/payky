import type { CreateWebSocket } from "@evolu/common"
import { createNodeEvolu } from "../runtime/node-evolu.ts"

/**
 * A fresh app Evolu in memory, disposed with the returned object. Every one
 * is owned by the Evolu test owner, so two of them are two devices of one
 * account. It opens no socket unless given `createWebSocket`, for a test
 * relay.
 */
export const createEvoluTest = (
  options: { readonly createWebSocket?: CreateWebSocket } = {}
) => createNodeEvolu("memory", options)
