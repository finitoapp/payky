// Serves an `expo export --platform web` output with the SPA fallback the
// static export needs: a path with no file behind it gets index.html.
// `bun e2e/scripts/serve-web.ts [dir] [port]` serves by hand; run.ts imports it.
import { join, resolve } from "node:path"

export function serveWeb(root: string, port: number) {
  const dir = resolve(root)
  return Bun.serve({
    hostname: "127.0.0.1",
    port,
    async fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname)
      const file = Bun.file(join(dir, path))
      return new Response(
        path !== "/" && (await file.exists())
          ? file
          : Bun.file(join(dir, "index.html"))
      )
    },
  })
}

if (import.meta.main) {
  const [root = "e2e/.generated/web", port = "8790"] = process.argv.slice(2)
  serveWeb(root, Number(port))
  console.log(`serving ${resolve(root)} on http://127.0.0.1:${port}`)
}
