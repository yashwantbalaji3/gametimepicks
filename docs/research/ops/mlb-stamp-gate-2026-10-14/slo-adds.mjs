// How many main commits over N days changed NO build input (new lists) but DID move the publication-SLO public
// fields — i.e. builds the new trigger adds back. Read-only; run from the repo root.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 512 << 20 });
const { buildInputPredicate, publicSloKey, PUBLICATION_SLO_PATH } = await import(`${process.cwd()}/app/src/lib/ops/stamp-only-gate.mjs`);
const NEW = buildInputPredicate(fs.readFileSync("app/scripts/vercel-ignore-build.sh", "utf8"));
const rows = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const sup = new Set(rows.filter((r) => r.verdict === "SUPPRESS").map((r) => r.sha));
const log = git("log", "origin/main", "--first-parent", `--since=${process.argv[2]}`, "--format=%H").trim().split("\n");
let adds = 0, sloMoves = 0, alreadyBuilding = 0;
for (const sha of log) {
  const files = git("diff-tree", "--no-commit-id", "-r", "--name-only", sha).split("\n").filter(Boolean);
  if (!files.includes(PUBLICATION_SLO_PATH)) continue;
  let a, b; try { a = publicSloKey(git("show", `${sha}^:${PUBLICATION_SLO_PATH}`)); b = publicSloKey(git("show", `${sha}:${PUBLICATION_SLO_PATH}`)); } catch { continue; }
  if (a === b) continue;
  sloMoves++;
  // Under the gate, a suppressed MLB run keeps only free files; a non-suppressed commit builds on its own inputs.
  const builds = sup.has(sha.slice(0, 10)) ? false : files.some(NEW);
  if (builds) alreadyBuilding++; else adds++;
}
console.log(JSON.stringify({ commits: log.length, sloPublicMoves: sloMoves, alreadyBuildingAnyway: alreadyBuilding, buildsAddedByTrigger: adds }));
