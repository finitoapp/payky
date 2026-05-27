import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import { createRun } from "@evolu/common"
import { createEvoluDeps } from "@evolu/react-web"
import { createAppEvolu } from "@/core/evolu/client.ts"
import { AppProviders } from "@/providers/evolu.tsx"
import App from "./App.tsx"

const rootElement = document.getElementById("root")

if (rootElement == null) {
  throw new Error("Root element was not found.")
}

const run = createRun(createEvoluDeps())
const evolu = await run.orThrow(createAppEvolu())

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders evolu={evolu}>
      <App />
    </AppProviders>
  </StrictMode>
)
