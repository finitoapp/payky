/**
 * A deliberate crash, kept in every build — production included — for
 * checking the root error boundary's screen and, with error reporting on, the
 * scrubbed event that reaches Sentry. The twin of web's `/error`: reachable by
 * URL only, linked from nowhere, `free` in `route-access.ts`. Not dead code;
 * don't gate it behind `__DEV__` or delete it.
 */
export default function ErrorTestRoute(): never {
  throw new Error("Intentional test error from /error route.")
}
