/**
 * READ-ONLY · how much of the NFL event window's CRITICAL-path churn carries information (cost work, 2026-10-26).
 *
 * The two-tier deploy gate (draft #1250) builds immediately for `data/internal/nfl/forecast-receipts/` and
 * `app/public/data/nfl/forecasts/`. For every first-parent `main` commit in a window whose subject starts
 * `auto: nfl event window`, this classifies each change to those paths, comparing the commit with its parent:
 *
 *   (a) VALUES   a number a reader sees moved: a forecast's forecastSummary / marketComparison / teamInputs state, or
 *                a game entering or leaving the published set;
 *   (b) INPUTS   values identical, but a recorded input moved (model heads' fold counts, evidence other than clocks,
 *                side decision, anything else that is not a clock);
 *   (c) STAMPS   only clocks / identities of the run moved (generatedAt, strengthCutoff, schedule stamp,
 *                participationAsOf, frozenAt, inputHash, revision lineage).
 *
 * A commit takes the strongest class among its critical changes. Usage:
 *   node scripts/nfl/measure-nfl-critical-churn.mjs --from 2026-10-19T16:00:00Z --to 2026-10-26T16:00:00Z [--json out]
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 512 << 20 });
const show = (c, p) => { try { return JSON.parse(git("show", `${c}:${p}`)); } catch { return null; } };
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const FROM = arg("--from", "2026-10-19T16:00:00Z");
const TO = arg("--to", "2026-10-26T16:00:00Z");
const REF = arg("--ref", "origin/main");

const RECEIPTS = "data/internal/nfl/forecast-receipts/";
const PUBLIC = "app/public/data/nfl/forecasts/";

/** Clocks and run identities — never information a reader acts on. */
const STAMP_KEYS = new Set(["generatedAt", "strengthCutoff", "schedule", "participationAsOf", "frozenAt", "inputHash", "revisionOf", "priorInputHash", "inputs", "capturedAt", "sourceGeneratedAt", "asOf", "frozenCount", "note"]);
const VALUE_KEYS = ["forecastSummary", "marketComparison", "state"];

const strip = (v) => {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k]) => !STAMP_KEYS.has(k)).map(([k, x]) => [k, strip(x)]));
  return v;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const values = (f) => JSON.stringify(Object.fromEntries(VALUE_KEYS.map((k) => [k, f?.[k] ?? null]).concat([["teamInputsState", f?.teamInputs?.state ?? null]])));

/** Class of one forecast-shaped change. */
function classify(before, after) {
  if (!before || !after) return "a";
  if (values(before) !== values(after)) return "a";
  if (!same(strip(before), strip(after))) return "b";
  return "c";
}
const RANK = { c: 0, b: 1, a: 2 };
const strongest = (xs) => xs.reduce((m, x) => (RANK[x] > RANK[m] ? x : m), "c");

/** Which keys differ outside the value keys and stamps (for the (b) breakdown). */
function inputKeysMoved(before, after, prefix = "") {
  const out = [];
  const a = strip(before ?? {});
  const b = strip(after ?? {});
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!prefix && (VALUE_KEYS.includes(k))) continue;
    if (same(a[k], b[k])) continue;
    if (a[k] && b[k] && typeof a[k] === "object" && !Array.isArray(a[k])) out.push(...inputKeysMoved(a[k], b[k], `${prefix}${k}.`));
    else out.push(`${prefix}${k}`);
  }
  return out;
}

const commits = git("log", "--first-parent", "--format=%H\t%cI\t%s", `--since=${FROM}`, `--until=${TO}`, REF).trim().split("\n").filter(Boolean)
  .map((l) => l.split("\t")).filter(([, , s]) => s.startsWith("auto: nfl event window")).reverse();

const rows = [];
for (const [c, at] of commits) {
  const changed = git("show", "--format=", "--name-status", "--first-parent", c).trim().split("\n").filter(Boolean).map((l) => l.split("\t"));
  const crit = changed.filter(([, p]) => p.startsWith(RECEIPTS) || p.startsWith(PUBLIC));
  if (!crit.length) { rows.push({ commit: c, at, critical: false }); continue; }
  const classes = [];
  const moved = new Map();
  const note = (k) => moved.set(k, (moved.get(k) ?? 0) + 1);
  let receiptsAdded = 0;
  let dayFileNew = false;
  for (const [st, p] of crit) {
    if (p.startsWith(RECEIPTS)) {
      if (st !== "A" || !/\/\d+(-rev-\d{4}Z)?\.json$/.test(p)) { classes.push("a"); note(`receipt ${st}`); continue; }
      receiptsAdded++;
      const doc = show(c, p);
      const id = String(doc?.providerEventId ?? "");
      const dir = path.posix.dirname(p);
      const prior = git("ls-tree", "--name-only", `${c}^`, `${dir}/`).trim().split("\n").filter((f) => f && path.posix.basename(f).startsWith(id) && /\/\d+(-rev-\d{4}Z)?\.json$/.test(f))
        .map((f) => show(`${c}^`, f)).filter(Boolean).sort((x, y) => x.generatedAt.localeCompare(y.generatedAt)).at(-1) ?? null;
      const k = prior ? classify(prior, doc) : "a"; // a first receipt for a game is new information
      classes.push(k);
      if (k === "b") for (const m of inputKeysMoved(prior, doc)) note(`receipt ${m}`);
      continue;
    }
    // public forecast files: compare per game, plus set membership
    const before = show(`${c}^`, p);
    const after = show(c, p);
    const list = (d) => new Map((d?.forecasts ?? []).map((f) => [String(f.providerEventId), f]));
    const B = list(before);
    const A = list(after);
    if (!before && after && /\/\d{4}-\d{2}-\d{2}\.json$/.test(p)) { dayFileNew = true; note(`public ${path.posix.basename(p)} new day file`); continue; }
    if (!before || !after || B.size !== A.size || [...A.keys()].some((id) => !B.has(id))) { classes.push("a"); note(`public ${path.posix.basename(p)} set`); continue; }
    const per = [...A.entries()].map(([id, f]) => classify(B.get(id), f));
    const top = { ...after, forecasts: null };
    const topB = { ...before, forecasts: null };
    const k = strongest([...per, same(strip(topB), strip(top)) ? "c" : "b"]);
    classes.push(k);
    if (k === "b") for (const [id, f] of A) for (const m of inputKeysMoved(B.get(id), f)) note(`public ${m}`);
  }
  rows.push({ commit: c, at, critical: true, class: classes.length ? strongest(classes) : "c", dayFileNew, receiptsAdded, moved: Object.fromEntries(moved) });
}

const crit = rows.filter((r) => r.critical);
const count = (k) => crit.filter((r) => r.class === k).length;
const movedTotals = {};
for (const r of crit.filter((x) => x.class === "b")) for (const [k, n] of Object.entries(r.moved)) movedTotals[k] = (movedTotals[k] ?? 0) + n;
const summary = {
  window: { from: FROM, to: TO, ref: REF },
  eventWindowCommits: rows.length,
  criticalCommits: crit.length,
  byClass: { a_values: count("a"), b_inputsOnly: count("b"), c_stampsOnly: count("c") },
  cWithNewDayFileOnly: crit.filter((r) => r.class === "c" && r.dayFileNew).length,
  receiptFilesAdded: crit.reduce((s, r) => s + r.receiptsAdded, 0),
  bInputsMoved: Object.fromEntries(Object.entries(movedTotals).sort((x, y) => y[1] - x[1]).slice(0, 25)),
  byDay: Object.fromEntries([...new Set(crit.map((r) => r.at.slice(0, 10)))].map((d) => [d, ["a", "b", "c"].map((k) => crit.filter((r) => r.at.startsWith(d) && r.class === k).length).join("/")])),
};
console.log(JSON.stringify(summary, null, 1));
const out = arg("--json");
if (out) fs.writeFileSync(out, JSON.stringify({ summary, rows }, null, 1) + "\n");
