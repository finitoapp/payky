import { atom } from "jotai"

export const evoluCounterAtom = atom<number>(0)

/** Write-only: bumps `evoluCounterAtom` to force the app Evolu client to reload. */
export const reloadAppEvoluAtom = atom(null, (_get, set) => {
  set(evoluCounterAtom, (current) => current + 1)
})
