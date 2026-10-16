import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const repositoryRoot = fileURLToPath(
  new URL("../../..", import.meta.url)
)

export const resolveSqlitePath = (
  value: string | undefined,
  cwd: string
): string =>
  value === undefined
    ? resolve(repositoryRoot, ".data/payky.db")
    : resolve(cwd, value)
