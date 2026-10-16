import { defineConfig } from "vitest/config"
export default defineConfig({
  test: {
    root: import.meta.dirname,
    name: "core",
    setupFiles: ["./src/testing/setup.ts"],
    env: { TZ: "Europe/Prague" },
  },
})
