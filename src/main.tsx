import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import { createConsole, createRun } from "@evolu/common"
import { createEvoluDeps } from "@evolu/react-web"
import { backgroundJobs } from "@/core/background-jobs/background-jobs.ts"
import { runBackgroundJobs } from "@/core/background-jobs/run-background-jobs.ts"
import { createAppEvolu } from "@/core/evolu/client.ts"
import { AppProviders } from "@/providers/evolu.tsx"
import App from "./App.tsx"

const rootElement = document.getElementById("root")

if (rootElement == null) {
  throw new Error("Root element was not found.")
}

const appConsole = createConsole()
const evoluDeps = createEvoluDeps({ console: appConsole })
const evoluRun = createRun(evoluDeps)
const evolu = await evoluRun.orThrow(createAppEvolu())
const backgroundJobsRun = createRun({
  console: appConsole,
  evolu,
  onError: (error: unknown) => {
    console.error("Background job cleanup failed.", error)
  },
})
const backgroundJobsDisposable = await backgroundJobsRun.orThrow(
  runBackgroundJobs(backgroundJobs)
)

if (import.meta.hot != null) {
  import.meta.hot.dispose(() => {
    backgroundJobsDisposable[Symbol.dispose]()
  })
}

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders evolu={evolu}>
      <App />
    </AppProviders>
  </StrictMode>
)
