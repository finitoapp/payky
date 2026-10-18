import { useEffect, useRef, useState } from "react"

interface AsyncValue<T> {
  readonly data: T | null
  readonly failed: boolean
  readonly loading: boolean
}

/**
 * Native has no TanStack Query, so a read from a remote or native API (the
 * Spark balance, an LNURL's metadata, the BTC rate) goes through this. Loads
 * when `key` changes, `null` loads nothing, and a result for a key that has
 * been replaced is dropped. With `refetchMs` it asks again until `done` says
 * the answer is final.
 */
export function useAsyncValue<T>(
  key: string | null,
  load: () => Promise<T>,
  options: {
    readonly refetchMs?: number
    readonly done?: (data: T) => boolean
  } = {}
): AsyncValue<T> {
  const [state, setState] = useState<AsyncValue<T>>({
    data: null,
    failed: false,
    loading: key !== null,
  })
  const latest = useRef({ load, options })
  latest.current = { load, options }

  useEffect(() => {
    if (key === null) {
      setState({ data: null, failed: false, loading: false })
      return
    }
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    setState((previous) => ({ ...previous, loading: true }))

    const attempt = async () => {
      try {
        const data = await latest.current.load()
        if (cancelled) return
        setState({ data, failed: false, loading: false })
        const { refetchMs, done } = latest.current.options
        if (refetchMs !== undefined && done?.(data) !== true) {
          timer = setTimeout(attempt, refetchMs)
        }
      } catch {
        if (cancelled) return
        setState((previous) => ({ ...previous, failed: true, loading: false }))
        const { refetchMs } = latest.current.options
        if (refetchMs !== undefined) timer = setTimeout(attempt, refetchMs)
      }
    }
    void attempt()

    return () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [key])

  return state
}
