import { defineConfig } from "vitest/config"
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage",
      include: [
        "apps/web-app/src/**/*.{ts,tsx}",
        "apps/web-app/api/**/*.ts",
        "apps/cli/src/**/*.ts",
        "packages/core/src/**/*.ts",
      ],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.d.ts",
        "**/*-test-fixtures.ts",
        "packages/core/src/testing/**",
        "apps/web-app/src/components/ui/**",
        "apps/web-app/src/components/reui/**",
        "apps/web-app/src/routeTree.gen.ts",
      ],
    },
    projects: [
      "apps/web-app/vite.config.ts",
      "packages/core/vitest.config.ts",
      "apps/cli/vitest.config.ts",
      { test: { name: "tools", include: ["bin/**/*.test.ts"] } },
    ],
  },
})
