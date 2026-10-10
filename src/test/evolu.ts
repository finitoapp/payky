import { createCliEvolu } from "@/core/cli/cli-evolu.ts"

/** A fresh app Evolu in memory, disposed with the returned object. */
export const createEvoluTest = () => createCliEvolu("memory")
