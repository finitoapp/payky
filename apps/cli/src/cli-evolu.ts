import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { createNodeEvolu } from "@payky/core/runtime/node-evolu"
import { cliEnv } from "./cli-env.ts"
export const createCliEvolu = (filename = cliEnv.PAYKY_SQLITE_PATH) => {
  if (filename !== "memory") mkdirSync(dirname(filename), { recursive: true })
  return createNodeEvolu(filename)
}
