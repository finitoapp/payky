import { createNodeEvolu } from "../runtime/node-evolu.ts"

/** A fresh app Evolu in memory, disposed with the returned object. */
export const createEvoluTest = () => createNodeEvolu("memory")
