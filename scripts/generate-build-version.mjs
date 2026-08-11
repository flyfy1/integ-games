import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [repository, service, output] = process.argv.slice(2);
if (!repository || !service || !output) throw new Error("usage: generate-build-version.mjs <repository> <service> <output>");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const commit = (process.env.BUILD_COMMIT || git("rev-parse", "HEAD")).trim();
const dirty = process.env.BUILD_DIRTY ? process.env.BUILD_DIRTY === "true" : git("status", "--porcelain").length > 0;
const builtAt = process.env.BUILD_TIME || new Date().toISOString();
const version = process.env.BUILD_VERSION || `git-${commit.slice(0, 12)}${dirty ? "-dirty" : ""}`;
const target = resolve(output);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify({ schema: "integ.life/build-version/v1", repository, service, version, commit, builtAt, dirty }, null, 2)}\n`);
