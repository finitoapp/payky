# 0003 The assistant in the app reads a snapshot of the repository that only the web build carries

Status: accepted
Date: 2026-10-05

## Context

The assistant's documentation and source code tools read the git checkout,
so only the CLI had them. The assistant in the settings (ai/0002) could
answer about the merchant's data, but not why Payky behaves the way it
does, which the business decisions in `docs/decisions/` and the code say.
The repository is public. Its text under `src/`, `api/`, `docs/` and
`AGENTS.md` is about 3.6 MB, some 700 kB compressed: too much to put into
every native app or to precache for every user who never asks.

## Decision

The web build emits `repo-snapshot.json`: every text file git tracks under
`src/`, `api/`, `docs/` and `AGENTS.md`, with the commit it was built
from. The native build (`PAYKY_CAPACITOR_BUILD=1`) leaves it out, and the
web's service worker does not precache it.

The assistant in the app downloads the snapshot when a tool first needs it
and keeps it while the app runs; a failed download is tried again with the
next tool call. The web reads the snapshot of its own deployment, the
native app the one of payky.me (`VITE_PAYKY_API_BASE_URL`), which may be of
another version than the app. When it is, every tool result says so, so
the model does not blame the app for code it does not run.

The CLI and the app share the tools, `listFiles`, `readFile` and
`searchCode`, and differ only in where the files come from: the git
checkout or the snapshot. Both list only text files git tracks, and search
with a case-insensitive JavaScript regular expression.

## Alternatives considered

Bundling the business decisions alone, one lazy chunk each, which was the
first version of this decision: it answered why, but not how.

Bundling the whole snapshot in every build, which was rejected: every
native app would carry it.

Endpoints that list, read and search on the server, which were rejected for
now: they download less, but add a server part and run the model's
regular expressions there.

Reading the files from GitHub, which was rejected: searching code needs a
token, the unauthenticated rate limit is low, and the code would not be of
any deployed version.

## Consequences

The first tool call that reads the code downloads the whole snapshot, and
the assistant cannot read the code offline, as it cannot answer offline at
all (ai/0001). The native app reads the code of the latest web deployment,
not its own. Whatever the model reads goes through Payky's proxy to the
provider (ai/0001).

## Enforced by

- `src/core/ai/repo-ai-tools.test.ts > createRepoAiTools > refuses a path that is not a repository file`
- `src/core/ai/repo-ai-tools.test.ts > createRepoAiTools > puts the note before every result`
- `src/core/cli/git-repo-files.test.ts > createGitRepoFiles > leaves binary files out`
- `src/features/settings/assistant/snapshot-repo-files.test.ts > snapshotRepoFiles > notes when the snapshot is of another version than the app`
- `src/features/settings/assistant/snapshot-repo-files.test.ts > createSnapshotRepoFilesLoader > downloads the snapshot once, and again after a failed download`
