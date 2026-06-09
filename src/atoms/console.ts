import { createConsole } from "@evolu/common"
import { atom } from "jotai"

export const consoleAtom = atom(() => {
  return createConsole()
})
