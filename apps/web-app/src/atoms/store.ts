import { createStore } from "jotai"

/**
 * The app's one Jotai store. Its own module so the router can hand it to
 * `beforeLoad` through the router context, which runs outside React.
 */
export const jotaiStore = createStore()
