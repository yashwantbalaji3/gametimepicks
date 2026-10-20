// Sanity check: does the mutation test go red when the ignore script is mutated? Runs against copies in scratch.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const WT = "/Users/yashwantbalaji/Downloads/gametimepicks-wt/cost-1019";
const S = path.join(new URL(".", import.meta.url).pathname, "mut");
const src = fs.readFileSync(`${WT}/app/scripts/vercel-ignore-build.sh`, "utf8");
const MUTANTS = {
  "nfl data made non-input": src.replace("    'app/public/data/admin/status.json'\n", "    'app/public/data/admin/status.json'\n    'app/public/data/nfl/'\n"),
  "empty base skips": src.replace(`echo "[ignore-build] no previous deployed SHA — building"\n    exit 1`, `exit 0`),
  "unreachable base skips": src.replace(`not in clone (shallow gap / force push) — building"\n    exit 1`, `not in clone"\n    exit 0`),
  "non-input exclusion dropped": src.replace(`BUILD_INPUTS+=( ":(top,exclude)\${_nbi}" )`, `:`),
  "docs added as input": src.replace("    ':(top)app/'\n", "    ':(top)app/'\n    ':(top)docs/'\n"),
  "SLO clause always skips": src.replace(`if ! node "\${_top}/app/scripts/ops/publication-slo-public-changed.mjs" "$BASE" HEAD; then`, `if false; then`),
};
for (const [name, text] of Object.entries(MUTANTS)) {
  if (text === src) { console.log(`${name}: MUTATION DID NOT APPLY`); continue; }
  fs.rmSync(S, { recursive: true, force: true });
  for (const rel of ["app/src/lib/vercel-ignore-build.mutation.test.mjs", "app/scripts/ops/publication-slo-public-changed.mjs", "app/src/lib/ops/stamp-only-gate.mjs",
    "app/src/app/nfl/page.tsx", "app/src/lib/sport-hub/nba-hub.ts", "app/src/lib/top-reads.ts",
    "app/public/data/nfl/schedule/latest.json", "app/public/data/nba/schedule/latest.json", "app/public/data/admin/model-health.json"]) {
    fs.mkdirSync(path.dirname(`${S}/${rel}`), { recursive: true });
    fs.copyFileSync(`${WT}/${rel}`, `${S}/${rel}`);
  }
  fs.mkdirSync(`${S}/app/scripts`, { recursive: true });
  fs.writeFileSync(`${S}/app/scripts/vercel-ignore-build.sh`, text);
  const r = spawnSync("node", ["--test", `${S}/app/src/lib/vercel-ignore-build.mutation.test.mjs`], { encoding: "utf8" });
  const fails = [...r.stdout.matchAll(/^not ok \d+ - (.*)$/gm)].map((m) => m[1]);
  console.log(`${name}: ${fails.length ? "KILLED by " + fails.length + " test(s): " + fails.join(" | ") : "SURVIVED"}`);
}
fs.rmSync(S, { recursive: true, force: true });
