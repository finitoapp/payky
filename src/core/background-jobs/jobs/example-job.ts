import type { BackgroundJob } from "@/core/background-jobs/background-job-types.ts"

export const startExampleJob: BackgroundJob = () => ({
  [Symbol.dispose]: () => {},
})
