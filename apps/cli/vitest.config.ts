import { defineConfig } from "vitest/config"
export default defineConfig({
  test: {
    root: import.meta.dirname,
    name: "cli",
    setupFiles: ["../../packages/core/src/testing/setup.ts"],
    env: { TZ: "Europe/Prague" },
  },
})
