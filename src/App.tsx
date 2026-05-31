import { RouterProvider } from "@tanstack/react-router"
import { createStore, Provider } from "jotai"
import { router } from "@/router.tsx"

const jotaiStore = createStore()

export function App() {
  return (
    <Provider store={jotaiStore}>
      <RouterProvider router={router} />
    </Provider>
  )
}

export default App
