import { useCallback, useState } from "react"

import type { TranslationKey } from "@/i18n/resources.ts"

type SettingsFormSubmitResult = boolean | undefined

type SettingsFormSubmitAction = () =>
  | SettingsFormSubmitResult
  | Promise<SettingsFormSubmitResult>

export interface SettingsForm<FormError> {
  readonly pending: boolean
  readonly saved: boolean
  readonly error: FormError | null
  readonly setError: (error: FormError | null) => void
  /** Clears the saved message, typically when an input changes. */
  readonly resetSaved: () => void
  /**
   * Runs the save work: sets `pending`, marks `saved` when the action does
   * not return `false`, and always clears `pending`. Synchronous actions
   * complete synchronously (no intermediate pending render); rejections clear
   * `pending` and propagate.
   */
  readonly submit: (action: SettingsFormSubmitAction) => void | Promise<void>
}

/**
 * Shared state machine for settings form cards.
 *
 * Owns the pending/saved/error trio previously hand-rolled by every settings
 * form. `error` covers forms with a single validation error; forms with
 * several field errors keep the extra ones as local state.
 */
export const useSettingsForm = <
  FormError = TranslationKey,
>(): SettingsForm<FormError> => {
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<FormError | null>(null)

  const resetSaved = useCallback(() => {
    setSaved(false)
  }, [])

  const submit = useCallback(
    (action: SettingsFormSubmitAction): void | Promise<void> => {
      setPending(true)

      let result: SettingsFormSubmitResult | Promise<SettingsFormSubmitResult>
      try {
        result = action()
      } catch (thrown) {
        setPending(false)
        throw thrown
      }

      if (result instanceof Promise) {
        // then/finally instead of async/await so synchronous actions above
        // finish without an intermediate pending render.
        return result
          .then((value) => {
            if (value !== false) setSaved(true)
          })
          .finally(() => {
            setPending(false)
          })
      }

      if (result !== false) setSaved(true)
      setPending(false)
      return undefined
    },
    []
  )

  return { pending, saved, error, setError, resetSaved, submit }
}
