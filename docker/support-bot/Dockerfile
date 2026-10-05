# The support bot (support/0004) in a container of its own, so a
# compromised dependency or a parser bug reaches neither the host nor the
# network around it. Built from the repository root by compose.yaml beside
# this file.

# Pinned by digest: a moved tag cannot change what gets built.
FROM oven/bun:1.4.2-slim@sha256:cb3bbbb08e13a4a2ff400f24c7a2a1d5efa83f6ef8544d52d95a519631e2fc61

# git reads the bot's clone of the repository; nothing else is added.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Exactly the locked production dependencies, and none of their install
# scripts: the bot needs no native build.
COPY package.json bun.lock bunfig.toml tsconfig.json ./
RUN bun install --frozen-lockfile --production --ignore-scripts

# The bot's code only. docs/ is not copied: the bot reads it from its clone.
COPY src ./src
COPY bin/support-bot.ts ./bin/support-bot.ts

# The clone's volume; created here so the volume is owned by the bot's user.
RUN mkdir /data && chown 10001:10001 /data

USER 10001:10001
ENV HOME=/tmp \
  PAYKY_BOT_REPO_DIR=/data/repo
CMD ["bun", "bin/support-bot.ts"]
