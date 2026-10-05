/**
 * The support bot (support/0004), a long-running process for a server of
 * our own: `bun run support-bot`. Configuration is in
 * `src/core/support-bot/support-bot-env.ts`; the team comes from Payky's
 * API (`VITE_PAYKY_API_BASE_URL`), so the bot's npub must be one of
 * `PAYKY_SUPPORT_NPUBS` there. Restart it after the team changes.
 *
 * Preferably in a hardened container: `docker/support-bot/compose.yaml`.
 * Or as a systemd service:
 *
 *   [Service]
 *   WorkingDirectory=/srv/payky
 *   EnvironmentFile=/etc/payky-support-bot.env
 *   ExecStart=/usr/local/bin/bun run support-bot
 *   Restart=always
 */
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createConsole, createRun } from "@evolu/common"
import { createProviderRegistry } from "ai"

import { createNostrDep } from "@/core/integrations/nostr/nostr-client.ts"
import { fetchSupportTeam } from "@/core/integrations/nostr/support-team-client.ts"
import { createSupportBot } from "@/core/support-bot/support-bot.ts"
import { supportBotEnv as env } from "@/core/support-bot/support-bot-env.ts"
import { createSupportBotRepo } from "@/core/support-bot/support-bot-repo.ts"

const log = (entry: Readonly<Record<string, unknown>>) => {
  process.stdout.write(
    `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`
  )
}

const main = async () => {
  await using run = createRun({
    fetch: globalThis.fetch,
    console: createConsole(),
  })
  const team = await run.orThrow(fetchSupportTeam())

  const repo = createSupportBotRepo({
    url: env.PAYKY_BOT_REPO_URL,
    directory: env.PAYKY_BOT_REPO_DIR,
  })
  await repo.sync()
  // Zero means the clone's default branch has no docs: the bot then
  // answers from the code alone or hands over.
  log({ event: "repo", docs: (await repo.docs()).length })

  const registry = createProviderRegistry({
    anthropic: createAnthropic({ apiKey: env.ANTHROPIC_API_KEY }),
    google: createGoogleGenerativeAI({
      apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    }),
  })
  const { nostr } = createNostrDep()

  const bot = createSupportBot({
    pool: nostr.pool,
    appRelays: nostr.relays,
    secretKey: env.PAYKY_BOT_NSEC,
    team,
    repo,
    models: {
      triage: registry.languageModel(env.PAYKY_BOT_MODEL_TRIAGE),
      docs: registry.languageModel(env.PAYKY_BOT_MODEL_DOCS),
      code: registry.languageModel(env.PAYKY_BOT_MODEL_CODE),
    },
    limits: {
      repliesPerAccount: env.PAYKY_BOT_REPLIES_PER_ACCOUNT,
      codeRepliesPerAccount: env.PAYKY_BOT_CODE_REPLIES_PER_ACCOUNT,
      codeReplies: env.PAYKY_BOT_CODE_REPLIES,
    },
    now: () => Math.floor(Date.now() / 1000),
    schedule: (ms, callback) => {
      const timer = setTimeout(callback, ms)
      return () => clearTimeout(timer)
    },
    log,
  })
  await bot.start()
  log({ event: "started", team: team.pubkeys.length })

  await new Promise<void>((resolve) => {
    process.once("SIGTERM", resolve)
    process.once("SIGINT", resolve)
  })
  bot.stop()
  process.exit(0)
}

void main().catch((error: unknown) => {
  log({ event: "fatal", error: String(error) })
  process.exit(1)
})
