import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/error")({
  component: ErrorTestPage,
})

function ErrorTestPage(): never {
  throw new Error("Intentional test error from /error route.")
}
