import { createFileRoute } from "@tanstack/react-router"

/**
 * A deliberate crash, kept in every build — production included — for
 * checking how the app handles one: the root error boundary's screen and,
 * with error reporting on, the event that reaches Sentry and how it is
 * scrubbed. Outside `_terminal` on purpose, so no access gate stands in front
 * of it, and linked from nowhere. Not dead code and not a leftover: don't
 * gate it behind DEV or delete it.
 */
export const Route = createFileRoute("/error")({
  component: ErrorTestPage,
})

function ErrorTestPage(): never {
  throw new Error("Intentional test error from /error route.")
}
