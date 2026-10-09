import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { sentryVitePlugin } from "@sentry/vite-plugin"
import { createEnv } from "@t3-oss/env-core"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import basicSsl from "@vitejs/plugin-basic-ssl"
import react from "@vitejs/plugin-react"
import type { ConfigEnv, PluginOption } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import type { ViteUserConfigFnObject } from "vitest/config"
import { defaultExclude } from "vitest/config"
import { z } from "zod"

import { releaseCommitSubject } from "./bin/release-version.ts"
import packageJson from "./package.json" with { type: "json" }
import { isAndroidWebView } from "./src/core/native/runtime.ts"
import { installOneTabLocks } from "./src/polyfills/one-tab-locks.ts"

/** A build switch: on only when set to exactly "1". */
const BuildFlagSchema = z
  .string()
  .optional()
  .transform((value) => value === "1")

const buildEnv = createEnv({
  server: {
    // `bun run cap:sync`'s build for the native app.
    PAYKY_CAPACITOR_BUILD: BuildFlagSchema,
    // Turns the dev server's self-signed HTTPS off, for Android live reload.
    PAYKY_DISABLE_BASIC_SSL: BuildFlagSchema,
    // `bun run test:e2e:preview`'s one-off build, see `__E2E_TEST_BUILD__`.
    PAYKY_E2E_BUILD: BuildFlagSchema,
    // Source map upload; unset skips it (see `.env.example`).
    SENTRY_AUTH_TOKEN: z.string().optional(),
    SENTRY_ORG: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})

/**
 * The version the app shows and Sentry's `release`, which is what ties an
 * event to its source maps (`docs/releases.md`). The release commit
 * `bin/release.ts` makes builds as the `package.json` version itself; every
 * other commit — edge.payky.me, a local build — is that last release plus its
 * commit, so two edge builds never share a release. Without git (a source
 * tarball, a Docker build context) only the version is known.
 */
function getAppVersion(): string {
  const { version } = packageJson
  try {
    const [sha, subject] = execFileSync(
      "git",
      ["log", "-1", "--format=%h%n%s"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    )
      .trim()
      .split("\n")
    return subject === releaseCommitSubject(version)
      ? version
      : `${version}-edge.${sha}`
  } catch {
    return version
  }
}

/**
 * Evolu's workers get the same lock fix as the main thread
 * (`src/polyfills/one-tab-locks.ts`), from the same source: both
 * functions are self-contained, so their source text runs as is. The workers
 * have no Capacitor to ask, so the user agent alone decides there.
 */
// Wrapped, so its names cannot meet the worker chunk's own top-level ones.
const evoluAndroidWebViewWorkerLocksShim = `(() => {
${isAndroidWebView}
if (isAndroidWebView()) (${installOneTabLocks})();
})();
`

function evoluAndroidWebViewWorkerLocksPlugin(): PluginOption {
  return {
    name: "payky-evolu-android-webview-worker-locks",
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type !== "chunk") continue
        if (
          !item.fileName.startsWith("assets/Shared.worker-") &&
          !item.fileName.startsWith("assets/Db.worker-")
        ) {
          continue
        }

        item.code = `${evoluAndroidWebViewWorkerLocksShim}\n${item.code}`
      }
    },
  }
}

const repoSnapshotPaths = ["src", "api", "docs", "AGENTS.md"]

/**
 * The repository's text files the app assistant's tools read (ai/0003), as
 * `src/core/integrations/repo-snapshot/repo-snapshot-client.ts` expects them.
 * Only files git tracks, so `.env` files and build output stay out.
 */
function readRepoSnapshot(): string {
  // `-I` leaves binary files out; every text file matches the empty pattern.
  const paths = execFileSync(
    "git",
    ["grep", "-I", "-l", "-z", "-e", "", "--", ...repoSnapshotPaths],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  )
    .split("\0")
    .filter((file) => file !== "")
  const files = Object.fromEntries(
    paths.map((file) => [file, readFileSync(file, "utf8")])
  )
  return JSON.stringify({ version: getAppVersion(), files })
}

/** Serves the snapshot in development and emits it with the web build. */
function repoSnapshotPlugin(): PluginOption {
  return {
    name: "payky-repo-snapshot",
    configureServer(server) {
      server.middlewares.use("/repo-snapshot.json", (_request, response) => {
        response.setHeader("content-type", "application/json")
        response.end(readRepoSnapshot())
      })
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "repo-snapshot.json",
        source: readRepoSnapshot(),
      })
    },
  }
}

/**
 * The landing page is its own document, prerendered once per language by
 * `bin/prerender-landing.ts` (landing/0002). These middlewares give the dev
 * and preview servers the addresses `vercel.json` gives production: the dev
 * server serves the unrendered template, which renders in the browser, and
 * the preview server serves the prerendered file for the address's
 * language, Czech at `/landing`.
 */
function landingPagesPlugin(): PluginOption {
  const landingPath = /^\/landing(?:\/([a-z]{2}))?\/?(?:\?.*)?$/u
  return {
    name: "payky-landing-pages",
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        if (request.url !== undefined && landingPath.test(request.url)) {
          request.url = "/landing.html"
        }
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, _response, next) => {
        const match = request.url?.match(landingPath)
        if (match) {
          request.url = `/landing-${match[1] ?? "cs"}.html`
        }
        next()
      })
    },
  }
}

function isNativeAndroidWebViewBuild(command: string): boolean {
  return command === "build" && buildEnv.PAYKY_CAPACITOR_BUILD
}

// https://vite.dev/config/
export default (({ command, isSsrBuild }: ConfigEnv) => {
  const useAndroidWebViewWorkerLocksPlugin =
    isNativeAndroidWebViewBuild(command)
  const isCapacitorBuild = buildEnv.PAYKY_CAPACITOR_BUILD
  const useBasicSsl = !buildEnv.PAYKY_DISABLE_BASIC_SSL
  const sentryAuthToken = buildEnv.SENTRY_AUTH_TOKEN
  const useSentryVitePlugin =
    command === "build" && !isSsrBuild && Boolean(sentryAuthToken)
  // The server bundle `bin/prerender-landing.ts` renders the landing page
  // with; it ships nothing, so it needs no worker, snapshot or upload.
  const isLandingServerBuild = isSsrBuild === true
  const appVersion = getAppVersion()

  return {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      // Keeps the e2e seed bridge (src/components/e2e-test-bridge.tsx) alive
      // in the one production build `bun run test:e2e:preview` produces, since
      // `import.meta.env.DEV` is false in every `vite build` output
      // regardless of how it's later served. Real production builds never
      // set PAYKY_E2E_BUILD, so this stays false (and the bridge dead code)
      // for anything actually shipped.
      __E2E_TEST_BUILD__: JSON.stringify(buildEnv.PAYKY_E2E_BUILD),
    },
    build: {
      sourcemap: useSentryVitePlugin,
      // The native app opens the terminal only, never the landing page.
      ...(isCapacitorBuild || isLandingServerBuild
        ? {}
        : {
            rolldownOptions: {
              input: {
                main: path.resolve(import.meta.dirname, "index.html"),
                landing: path.resolve(import.meta.dirname, "landing.html"),
              },
            },
          }),
    },
    plugins: [
      ...(useBasicSsl ? [basicSsl()] : []),
      ...(useAndroidWebViewWorkerLocksPlugin
        ? [evoluAndroidWebViewWorkerLocksPlugin()]
        : []),
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
      }),
      react(),
      tailwindcss(),
      landingPagesPlugin(),
      // The native app reads payky.me's snapshot instead of carrying one.
      ...(isCapacitorBuild || isLandingServerBuild
        ? []
        : [repoSnapshotPlugin()]),
      ...(isLandingServerBuild
        ? []
        : [
            VitePWA({
              registerType: "prompt",
              injectRegister: "auto",
              // The native app ships its assets in the APK, so a service worker only
              // gets in the way: its precache survives an APK update and serves the
              // old bundle until the update toast is accepted. The self-destroying
              // worker replaces one already installed, clears it and reloads once.
              selfDestroying: isCapacitorBuild,
              manifest: false,
              workbox: {
                cleanupOutdatedCaches: true,
                globPatterns: ["**/*.{css,html,js,png,svg,webmanifest,woff2}"],
                maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
                navigateFallback: "/index.html",
                // The landing pages are served as they were prerendered, never
                // replaced by the app's shell or kept in its precache. Files
                // (sitemap.xml, robots.txt) and server routes go to the network
                // too, mirroring the SPA rewrite in vercel.json.
                navigateFallbackDenylist: [
                  /^\/landing(?:\/|$)/u,
                  /^\/(?:api|\.well-known)\//u,
                  /\/[^/]+\.[^/]+$/u,
                ],
                globIgnores: ["landing*.html", "landing/og-*.png"],
              },
            }),
          ]),
      ...(useSentryVitePlugin
        ? [
            sentryVitePlugin({
              org: buildEnv.SENTRY_ORG,
              project: buildEnv.SENTRY_PROJECT,
              authToken: sentryAuthToken,
              release: { name: appVersion },
              sourcemaps: {
                filesToDeleteAfterUpload: ["**/*.js.map"],
              },
            }),
          ]
        : []),
    ],
    worker: {
      plugins: () =>
        useAndroidWebViewWorkerLocksPlugin
          ? [evoluAndroidWebViewWorkerLocksPlugin()]
          : [],
    },
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
    optimizeDeps: {
      exclude: [
        "@evolu/web",
        "@evolu/react-web",
        "@evolu/react",
        "@evolu/common",
      ],
    },
    test: {
      exclude: [...defaultExclude, "e2e/**"],
      setupFiles: ["./src/test/setup.ts"],
      // The same zone `playwright.config.ts` pins, so a formatted date means
      // the same thing in both suites and on a developer machine that is not
      // in UTC. Without it the date formatters can only be asserted against
      // whatever zone the runner happens to sit in.
      env: { TZ: "Europe/Prague" },
      coverage: {
        provider: "v8",
        reporter: ["text", "html", "lcov"],
        reportsDirectory: "coverage",
        // Without `include`, Vitest reports only the modules some test
        // already imports, so every file with no test at all is simply
        // absent and adding one *raises* the percentage. Naming the sources
        // makes the number mean "of the code we ship" instead.
        include: ["src/**/*.{ts,tsx}", "api/**/*.ts"],
        // This version defaults `exclude` to `[]`, so everything that is not
        // shipped application code has to be listed here.
        exclude: [
          "**/*.test.{ts,tsx}",
          "**/*.d.ts",
          "src/test/**",
          "**/*-test-fixtures.ts",
          // Vendored as upstream ships them and never reviewed here; see
          // AGENTS.md.
          "src/components/ui/**",
          "src/components/reui/**",
          // Generated by the TanStack Router plugin.
          "src/routeTree.gen.ts",
        ],
      },
    },
  }
}) as ViteUserConfigFnObject
