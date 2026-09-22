import { execSync } from "node:child_process"
import path from "node:path"
import { sentryVitePlugin } from "@sentry/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import basicSsl from "@vitejs/plugin-basic-ssl"
import react from "@vitejs/plugin-react"
import type { ConfigEnv, PluginOption } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import type { ViteUserConfigFnObject } from "vitest/config"
import { defaultExclude } from "vitest/config"

import packageJson from "./package.json" with { type: "json" }

/**
 * Sentry's `release`, which is what ties an event to its source maps. The
 * commit is the precise answer, but it is unavailable in exactly the builds
 * hardest to reproduce afterwards — a source tarball, a Docker build context,
 * a shallow export — so fall back to the package version rather than to
 * `"unknown"`, which groups every such build together.
 */
function getAppVersion(): string {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return packageJson.version
  }
}

const evoluAndroidWebViewWorkerLocksShim = `
const __paykyIsAndroidWebView = /Android/i.test(globalThis.navigator.userAgent) && /; wv\\)|\\bwv\\b/i.test(globalThis.navigator.userAgent);
if (__paykyIsAndroidWebView && globalThis.navigator.locks) {
  const __paykyNativeLockManager = globalThis.navigator.locks;
  const __paykyEvoluOneTabSharedWorkerPolyfillLock = "evolu-one-tab-sharedworker-polyfill";
  Object.defineProperty(globalThis.navigator, "locks", {
    configurable: true,
    value: {
      request(name, optionsOrCallback, maybeCallback) {
        const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
        if (
          name === __paykyEvoluOneTabSharedWorkerPolyfillLock &&
          typeof optionsOrCallback !== "function" &&
          optionsOrCallback.ifAvailable === true &&
          callback
        ) {
          return Promise.resolve(callback({ mode: optionsOrCallback.mode ?? "exclusive", name }));
        }
        if (typeof optionsOrCallback === "function") {
          return __paykyNativeLockManager.request(name, optionsOrCallback);
        }
        if (!callback) return Promise.reject(new TypeError("LockManager.request requires a callback."));
        return __paykyNativeLockManager.request(name, optionsOrCallback, callback);
      },
      query() {
        return __paykyNativeLockManager.query();
      },
    },
  });
}
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

function isNativeAndroidWebViewBuild(command: string): boolean {
  return command === "build" && process.env.PAYKY_CAPACITOR_BUILD === "1"
}

// https://vite.dev/config/
export default (({ command }: ConfigEnv) => {
  const useAndroidWebViewWorkerLocksPlugin =
    isNativeAndroidWebViewBuild(command)
  const useBasicSsl = process.env.PAYKY_DISABLE_BASIC_SSL !== "1"
  const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN
  const useSentryVitePlugin = command === "build" && Boolean(sentryAuthToken)

  return {
    define: {
      __APP_VERSION__: JSON.stringify(getAppVersion()),
      // Keeps the e2e seed bridge (src/components/e2e-test-bridge.tsx) alive
      // in the one production build `bun run test:e2e:preview` produces, since
      // `import.meta.env.DEV` is false in every `vite build` output
      // regardless of how it's later served. Real production builds never
      // set PAYKY_E2E_BUILD, so this stays false (and the bridge dead code)
      // for anything actually shipped.
      __E2E_TEST_BUILD__: JSON.stringify(process.env.PAYKY_E2E_BUILD === "1"),
    },
    build: {
      sourcemap: useSentryVitePlugin,
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
      VitePWA({
        registerType: "prompt",
        injectRegister: "auto",
        manifest: false,
        workbox: {
          cleanupOutdatedCaches: true,
          globPatterns: ["**/*.{css,html,js,png,svg,webmanifest,woff2}"],
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
          navigateFallback: "/index.html",
        },
      }),
      ...(useSentryVitePlugin
        ? [
            sentryVitePlugin({
              org: process.env.SENTRY_ORG,
              project: process.env.SENTRY_PROJECT,
              authToken: sentryAuthToken,
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
