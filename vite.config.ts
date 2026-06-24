import { execSync } from "node:child_process"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import basicSsl from "@vitejs/plugin-basic-ssl"
import react from "@vitejs/plugin-react"
import type { ConfigEnv, PluginOption } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import type { ViteUserConfigFnObject } from "vitest/config"

function getAppVersion(): string {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return "unknown"
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

function isTauriBuild(command: string): boolean {
  return (
    command === "build" &&
    (process.env.TAURI_ENV_PLATFORM != null ||
      process.env.TAURI_ENV_TARGET_TRIPLE != null ||
      process.env.TAURI_ENV_ARCH != null)
  )
}

// https://vite.dev/config/
export default (({ command }: ConfigEnv) => {
  const useTauriWorkerLocksPlugin = isTauriBuild(command)

  return {
    define: {
      __APP_VERSION__: JSON.stringify(getAppVersion()),
    },
    plugins: [
      basicSsl(),
      ...(useTauriWorkerLocksPlugin
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
    ],
    worker: {
      plugins: () =>
        useTauriWorkerLocksPlugin
          ? [evoluAndroidWebViewWorkerLocksPlugin()]
          : [],
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
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
      coverage: {
        provider: "v8",
        reporter: ["text", "html", "lcov"],
        reportsDirectory: "coverage",
      },
    },
  }
}) as ViteUserConfigFnObject
