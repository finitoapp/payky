import { useAtomValue } from "jotai"
import { confirmQueueAtom } from "../atoms/confirm.ts"

/** Whether a confirmation is on screen, as web's `useIsConfirmDialogOpen`. */
export const useIsConfirmOpen = (): boolean =>
  useAtomValue(confirmQueueAtom).length > 0
