/**
 * Cuts a release from the current branch — `main`, or a `hotfix/*` branch
 * made from a release tag: commits the next CalVer into `package.json`, tags
 * that commit `v<version>` and pushes both. The tag starts
 * `.github/workflows/release.yml` (`docs/releases.md`).
 */
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import { nextReleaseVersion, releaseCommitSubject } from "./release-version.ts"

const git = (...args: ReadonlyArray<string>): string =>
  execFileSync("git", args, { encoding: "utf8" }).trim()

const fail = (message: string): never => {
  console.error(message)
  process.exit(1)
}

const branch = git("branch", "--show-current")
if (branch !== "main" && !branch.startsWith("hotfix/")) {
  fail(`Release from main or a hotfix/* branch, not "${branch}".`)
}
if (git("status", "--porcelain", "--untracked-files=no") !== "") {
  fail("Commit or stash your changes first.")
}

git("fetch", "--quiet", "--tags", "origin", branch)
if (git("rev-parse", "HEAD") !== git("rev-parse", `origin/${branch}`)) {
  fail(`${branch} differs from origin/${branch}; pull or push first.`)
}

const version = nextReleaseVersion(git("tag", "--list").split("\n"), new Date())
const tag = `v${version}`

const packageJsonPath = path.resolve(import.meta.dirname, "../package.json")
// The first "version" key is the package's own, ahead of any dependency's.
writeFileSync(
  packageJsonPath,
  readFileSync(packageJsonPath, "utf8").replace(
    /"version": "[^"]*"/u,
    `"version": "${version}"`
  )
)

git("commit", "--quiet", "-m", releaseCommitSubject(version), "package.json")
git("tag", "--annotate", tag, "-m", tag)
git("push", "--quiet", "--atomic", "origin", branch, tag)

console.log(`Released ${tag}; .github/workflows/release.yml ships it.`)
