import * as Sentry from "@sentry/react"

const dsn = import.meta.env.VITE_SENTRY_DSN

const SENSITIVE_TEXT_PATTERNS: ReadonlyArray<RegExp> = [
  // Recovery phrases: 11 or more consecutive lowercase words.
  /(?:\b[a-z]+\b[ \t]+){11,}\b[a-z]+\b/g,
  // IBAN-like bank account numbers.
  /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g,
]

function scrubText(text: string): string {
  return SENSITIVE_TEXT_PATTERNS.reduce(
    (result, pattern) => result.replace(pattern, "[redacted]"),
    text
  )
}

function scrubValue(value: unknown, depth: number): unknown {
  if (depth > 4) {
    return value
  }

  if (typeof value === "string") {
    return scrubText(value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, depth + 1))
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        scrubValue(entryValue, depth + 1),
      ])
    )
  }

  return value
}

function scrubBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb {
  return {
    ...breadcrumb,
    message:
      breadcrumb.message === undefined
        ? undefined
        : scrubText(breadcrumb.message),
    data:
      breadcrumb.data === undefined
        ? undefined
        : (scrubValue(breadcrumb.data, 0) as Sentry.Breadcrumb["data"]),
  }
}

function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  return {
    ...event,
    message: event.message === undefined ? undefined : scrubText(event.message),
    exception:
      event.exception === undefined
        ? undefined
        : {
            ...event.exception,
            values: event.exception.values?.map((exceptionValue) => ({
              ...exceptionValue,
              value:
                exceptionValue.value === undefined
                  ? undefined
                  : scrubText(exceptionValue.value),
            })),
          },
    extra:
      event.extra === undefined
        ? undefined
        : (scrubValue(event.extra, 0) as Sentry.ErrorEvent["extra"]),
    contexts:
      event.contexts === undefined
        ? undefined
        : (scrubValue(event.contexts, 0) as Sentry.ErrorEvent["contexts"]),
  }
}

let enabled = false

export function isErrorReportingAvailable(): boolean {
  return typeof dsn === "string" && dsn.length > 0
}

export function isErrorReportingEnabled(): boolean {
  return enabled
}

export function enableErrorReporting(): void {
  if (enabled || !isErrorReportingAvailable()) {
    return
  }

  Sentry.init({
    dsn,
    release: __APP_VERSION__,
    environment: import.meta.env.MODE,
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: scrubEvent,
  })

  enabled = true
}

export function disableErrorReporting(): void {
  if (!enabled) {
    return
  }

  enabled = false
  void Sentry.close()
}

export function captureReportedError(
  error: unknown,
  componentStack?: string
): void {
  if (!enabled) {
    return
  }

  Sentry.captureException(
    error,
    componentStack === undefined
      ? undefined
      : { contexts: { react: { componentStack } } }
  )
}
