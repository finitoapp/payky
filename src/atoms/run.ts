import { createEvoluDeps, createRun } from "@evolu/web"
import { atom } from "jotai"
import { consoleAtom } from "@/atoms/console.ts"

export const runAtom = atom((get) => {
  const console = get(consoleAtom)

  return createRun({
    console,
    ...createEvoluDeps(),
  })
})
