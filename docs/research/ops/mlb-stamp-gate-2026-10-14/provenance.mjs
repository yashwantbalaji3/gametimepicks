// Forecast-of-record equivalence: for every game in the replay window, the grader's rule (newest revision whose
// generatedAt pre-dates first pitch, over snapshots + committed revisions of the dated file) picks the same
// prediction row with and without the gate's suppressions. Read-only. Run from the repo root.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 512 << 20 });
const show = (rev, p) => { try { return JSON.parse(git("show", `${rev}:${p}`)); } catch { return null; } };
function canonical(v) { if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`; if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`; return JSON.stringify(v); }
const rows = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const suppressed = new Set(rows.filter((r) => r.verdict === "SUPPRESS").map((r) => r.sha));
const log = git("log", "origin/main", "--first-parent", "--since=12 days ago", "--format=%H").trim().split("\n");
const byDate = new Map();
for (const sha of log) {
  for (const p of git("diff-tree", "--no-commit-id", "-r", "--name-only", sha).split("\n")) {
    const m = /^app\/public\/data\/mlb\/predictions\/(\d{4}-\d{2}-\d{2})\.json$/.exec(p) ?? /^data\/internal\/mlb\/prediction-snapshots\/(\d{4}-\d{2}-\d{2})\/snapshot-\d{12}\.json$/.exec(p);
    if (!m) continue;
    if (!byDate.has(m[1])) byDate.set(m[1], []);
    byDate.get(m[1]).push({ sha: sha.slice(0, 10), path: p });
  }
}
let games = 0, same = 0, diff = [], noRevision = 0;
for (const [date, revs] of [...byDate].sort()) {
  const board = show("origin/main", `app/public/data/mlb/boards/${date}.json`);
  const fp = new Map((board?.games ?? []).map((g) => [g.gamePk, Date.parse(g.gameDate)]));
  const load = (keep) => revs.filter(keep).map((r) => show(r.sha, r.path)).filter((a) => a?.generatedAt && Array.isArray(a.predictions));
  const all = load(() => true), gated = load((r) => !suppressed.has(r.sha));
  const pick = (arts, pk) => arts.filter((a) => Date.parse(a.generatedAt) < fp.get(pk)).sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt))[0]?.predictions.find((p) => p.gamePk === pk) ?? null;
  for (const pk of fp.keys()) {
    const a = pick(all, pk), b = pick(gated, pk);
    if (!a && !b) { noRevision++; continue; }
    games++;
    if (a && b && canonical(a) === canonical(b)) same++; else diff.push(`${date} ${pk}`);
  }
}
console.log(JSON.stringify({ datesChecked: byDate.size, gamesWithPregameRevision: games, identicalForecastOfRecord: same, differing: diff, gamesWithNoPregameRevisionEitherWay: noRevision }));
