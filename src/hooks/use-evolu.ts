import { useAtomValue } from "jotai"
import { evoluAtom } from "@/atoms/evolu.ts"

export const useEvolu = () => useAtomValue(evoluAtom)
