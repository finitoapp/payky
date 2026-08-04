import { useSetAtom } from "jotai"
import { reloadAppEvoluAtom } from "@/atoms/evolu-counter.ts"

export const useReloadAppEvolu = () => useSetAtom(reloadAppEvoluAtom)
