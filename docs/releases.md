# Releases

| Target | Ships | Version shown |
| --- | --- | --- |
| `edge.payky.me` (PWA) | every push to `main` | `<last release>-edge.<sha>` |
| `payky.me` (PWA), Android on Google Play (internal track) and GitHub Releases | a `v<version>` tag | `<version>` |

Versions are CalVer `YY.M.MICRO` (`26.10.3`); MICRO restarts at 1 each month and stays below 100, because the Android `versionCode` is `YY*10000 + M*100 + MICRO` (`android/app/build.gradle`).

## How the version gets into a build

`version` in `package.json` is the last release. `bun run release` (`bin/release.ts`) is the only thing that changes it: it commits the next version as `chore(release): v<version>` and tags that commit. `vite.config.ts` builds the release commit as the version itself and every other commit as `<version>-edge.<sha>`; that string is `__APP_VERSION__`, the About page's version and Sentry's release. Gradle reads the same `package.json`.

## Release

1. On an up-to-date `main` with a clean working tree, run `bun run release`.
2. The pushed tag starts `.github/workflows/release.yml`, which checks the tag matches `package.json`, runs `bun run check`, then in parallel:
   - `web` force-pushes the `production` branch to the tag; the `payky` Vercel project deploys it to `payky.me`.
   - `android` builds the signed APK and AAB, uploads the AAB to Google Play's internal track and creates the GitHub release with the APK.

A failed job is re-run from the Actions page. A tag is never moved: a fix ships as the next version.

## Hotfix

1. `git switch -c hotfix/<name> v<version>`, commit the fix and push the branch.
2. Run `bun run release` on that branch; the release commit and tag land on it.
3. Cherry-pick the fix to `main`, or the next release drops it. `package.json` on `main` keeps the older version until then, which only affects edge's label.

## Rollback

The PWA: Instant Rollback in the `payky` Vercel project, which lasts until the next release moves `production`. Google Play has no rollback; ship a hotfix.

## Edge

Edge is a separate origin with its own local storage, but it syncs through the same Evolu servers and calls the same services as production. Whatever edge writes must stay readable by the last release.

## Vercel and GitHub setup

Two Vercel projects build this repository:

- `payky`: Production Branch `production`, domain `payky.me`. Preview deployments are disabled and the Ignored Build Step is `[ "$VERCEL_GIT_COMMIT_REF" != "production" ]`, so it builds nothing else.
- `payky-edge`: Production Branch `main`, domain `edge.payky.me`. Pull request previews come from this project.

Each project has its own environment variables (AI proxy key, donation wallet, Sentry); a new one goes into both.

GitHub secrets used by `release.yml`: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
