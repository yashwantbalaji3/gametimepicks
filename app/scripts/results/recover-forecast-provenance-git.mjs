#!/usr/bin/env node
/**
 * RECOVER FORECAST PROVENANCE FROM GIT HISTORY (audit 2026-10-23, A-T07 · F01). $0 — reads git history, spends nothing.
 *
 *   node app/scripts/results/recover-forecast-provenance-git.mjs [--write] [--check]
 *
 * Writes data/internal/forecast-ledger/v1/evidence/git-history.json: for ledger rows that lack a model id, an event
 * start or a publication stamp, the value a PAST REVISION of the file that published the forecast substantiates, with
 * the commit that holds it. The ledger builder (build-forecast-ledger.mjs) reads this file into provenance.recovered;
 * the builder itself never reads git history, because the nightly checkout is shallow.
 *
 * What it recovers, and the exact-match rule for each (anything that does not match exactly stays LEGACY_UNKNOWN):
 *   MLB game predictions graded from `git:<sha>` (the grade log names the revision): modelId = that revision's
 *     predictions[gamePk].decisionEngineVersion, only if its generatedAt equals the graded forecastGeneratedAt.
 *   Homer Nukes (the day file was overwritten during the day; the settled file records neither time): the revisions of
 *     homer-nukes/<date>.json that carry the SAME pick (player, gamePk, probability). eventStart = the pick's gameDate.
 *     publishedAt = the generatedAt of the LAST such revision that was both generated and committed before that start
 *     (the last pre-start publication, the ledger's forecast-of-record rule). None → no publication evidence.
 *
 * Append-only: an entry already in the file is never changed or dropped; a recomputation that disagrees is reported and
 * the committed entry kept. Deterministic: no clock; same history → byte-identical file. `--check` exits 1 if a fresh
 * recovery would add or differ from the committed file. Refuses on a shallow clone (a truncated history would silently
 * recover less).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PROVENANCE_STATE, validateRecovered } from "../../src/lib/forecast-ledger/provenance.mjs";
import { GIT_EVIDENCE_REL, GIT_EVIDENCE_SCHEMA } from "../../src/lib/forecast-ledger/provenance-evidence.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const LEDGER = path.join(ROOT, "data/internal/forecast-ledger/v1");
const OUT = path.join(ROOT, GIT_EVIDENCE_REL);
const SPORT_FILES = ["nfl.jsonl", "mlb.jsonl", "epl.jsonl", "ligue-1.jsonl", "ufc.jsonl"];
const MLB_FAMILY = { moneyline: "mlb_moneyline", run_line: "mlb_run_line", run_line_posted: "mlb_run_line_posted", total: "mlb_total" };
const GIT = PROVENANCE_STATE.GIT_HISTORY;

const git = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
const jsonl = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);
const utc = (iso) => new Date(Date.parse(iso)).toISOString().replace(/\.000Z$/, "Z");
const isIso = (v) => typeof v === "string" && Number.isFinite(Date.parse(v));

const shown = new Map();
function showAt(sha, rel) {
  const k = `${sha}:${rel}`;
  if (!shown.has(k)) {
    let doc = null;
    try { doc = JSON.parse(git(["show", k])); } catch { doc = null; }
    shown.set(k, doc);
  }
  return shown.get(k);
}

/** Every revision of a file, newest first: [{ sha, committedAt }]. */
function revisions(rel) {
  const out = git(["log", "--format=%H %cI", "--", rel]).trim();
  return out ? out.split("\n").map((l) => { const [sha, ci] = l.split(" "); return { sha, committedAt: utc(ci) }; }) : [];
}

export function recoverMlbGit(ledgerRows, graded) {
  const dateOf = new Map();
  for (const g of graded) {
    const family = MLB_FAMILY[g.market];
    if (family && Number.isInteger(g.gamePk) && String(g.forecastSource ?? "").startsWith("git:")) dateOf.set(`${g.gamePk}|${family}|${g.forecastSource}`, g.date);
  }
  const entries = {};
  for (const r of ledgerRows) {
    if (r.sport !== "MLB" || r.modelId != null || !String(r.receiptId ?? "").startsWith("git:")) continue;
    const date = dateOf.get(`${r.eventId}|${r.family}|${r.receiptId}`);
    if (!date) continue;
    const sha = r.receiptId.slice(4);
    const rel = `app/public/data/mlb/predictions/${date}.json`;
    const doc = showAt(sha, rel);
    if (!doc || !isIso(doc.generatedAt) || !isIso(r.publishedAt) || Date.parse(doc.generatedAt) !== Date.parse(r.publishedAt)) continue;
    const p = (doc.predictions ?? []).find((x) => String(x.gamePk) === r.eventId);
    const v = p?.decisionEngineVersion ?? null;
    if (typeof v !== "string" || !v) continue;
    entries[r.forecastId] = { modelId: { value: v, state: GIT, source: `git:${sha}:${rel}#predictions[gamePk=${r.eventId}].decisionEngineVersion` } };
  }
  return entries;
}

export function recoverHomerNukesGit(ledgerRows) {
  const entries = {};
  const revsOf = new Map();
  const missing = { noRevision: 0, noPreStart: 0 };
  for (const r of ledgerRows) {
    if (r.family !== "mlb_homer_nukes" || (r.eventStart != null && r.publishedAt != null)) continue;
    const m = /^mlb\/homer-nukes\/settled-(\d{4}-\d{2}-\d{2})\.json$/.exec(String(r.receiptId));
    if (!m) continue;
    const rel = `app/public/data/mlb/homer-nukes/${m[1]}.json`;
    if (!revsOf.has(rel)) revsOf.set(rel, revisions(rel));
    const playerId = String(r.subjectId).replace(/^mlb-player-/, "");
    const hits = [];
    for (const rev of revsOf.get(rel)) {
      const doc = showAt(rev.sha, rel);
      const pick = (doc?.picks ?? []).find((q) => String(q.playerId) === playerId && String(q.gamePk) === r.eventId && q.probability === r.probability);
      if (pick && isIso(pick.gameDate)) hits.push({ rev, doc, pick });
    }
    if (!hits.length) { missing.noRevision += 1; continue; }
    // newest first: the first pre-start one is the last pre-start publication.
    const pre = hits.find((h) => isIso(h.doc.generatedAt) && Date.parse(h.doc.generatedAt) < Date.parse(h.pick.gameDate) && Date.parse(h.rev.committedAt) < Date.parse(h.pick.gameDate));
    const at = pre ?? hits[0];
    const e = {};
    const sel = `#picks[playerId=${playerId},gamePk=${r.eventId}]`;
    if (r.eventStart == null) e.eventStart = { value: at.pick.gameDate, state: GIT, source: `git:${at.rev.sha.slice(0, 12)}:${rel}${sel}.gameDate` };
    if (r.publishedAt == null && pre) e.publishedAt = { value: pre.doc.generatedAt, state: GIT, source: `git:${pre.rev.sha.slice(0, 12)}:${rel}#generatedAt`, committedAt: pre.rev.committedAt };
    if (!pre) missing.noPreStart += 1;
    if (Object.keys(e).length) entries[r.forecastId] = e;
  }
  return { entries, missing };
}

const stable = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

/** Merge fresh entries under the committed ones (committed wins; disagreements reported). Pure. */
export function mergeEvidence(committed, fresh) {
  const merged = {};
  const conflicts = [];
  for (const id of new Set([...Object.keys(committed), ...Object.keys(fresh)])) {
    const c = committed[id] ?? {};
    const f = fresh[id] ?? {};
    const e = { ...f, ...c };
    for (const k of Object.keys(c)) if (f[k] && stable(f[k]) !== stable(c[k])) conflicts.push(`${id} ${k}`);
    merged[id] = e;
  }
  return { merged, conflicts };
}

export function renderEvidence(entries) {
  const ids = Object.keys(entries).sort();
  const order = ["modelId", "eventStart", "publishedAt"];
  const sorted = Object.fromEntries(ids.map((id) => [id, Object.fromEntries(order.filter((k) => entries[id][k]).map((k) => [k, entries[id][k]]))]));
  const count = (k) => ids.filter((id) => sorted[id][k]).length;
  return JSON.stringify({
    schemaVersion: GIT_EVIDENCE_SCHEMA,
    artifact: "forecast-ledger-git-evidence",
    dataClass: "PUBLIC_DERIVED",
    rule: "Values a past revision of the publishing file substantiates for ledger rows that lack them, keyed by forecastId; each names its commit. Exact matches only; append-only; read by build-forecast-ledger.mjs into provenance.recovered.",
    counts: { rows: ids.length, modelId: count("modelId"), eventStart: count("eventStart"), publishedAt: count("publishedAt") },
    entries: sorted,
  }, null, 1) + "\n";
}

function main() {
  if (git(["rev-parse", "--is-shallow-repository"]).trim() === "true") {
    console.error("REFUSED: shallow clone — a truncated history would silently recover less");
    process.exit(3);
  }
  const rows = SPORT_FILES.flatMap((f) => jsonl(path.join(LEDGER, f)));
  const graded = jsonl(path.join(ROOT, "app/public/data/mlb/results/game-predictions-graded.jsonl"));
  const mlb = recoverMlbGit(rows, graded);
  const hn = recoverHomerNukesGit(rows);
  const fresh = { ...mlb, ...hn.entries };
  for (const [id, e] of Object.entries(fresh)) for (const [k, v] of Object.entries(e)) {
    const bad = validateRecovered(k, v);
    if (bad.length) { console.error(`REFUSED: ${id} ${bad.join("; ")}`); process.exit(1); }
  }
  const committed = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")).entries ?? {} : {};
  const { merged, conflicts } = mergeEvidence(committed, fresh);
  const text = renderEvidence(merged);
  console.log(`git evidence: MLB model id ${Object.keys(mlb).length} row(s) · Homer Nukes ${Object.keys(hn.entries).length} row(s) (no matching revision ${hn.missing.noRevision}, no pre-start revision ${hn.missing.noPreStart})`);
  if (conflicts.length) console.log(`  recomputed values that differ from the committed evidence (committed kept): ${conflicts.length}\n    ${conflicts.slice(0, 10).join("\n    ")}`);
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : null;
  if (process.argv.includes("--check")) {
    console.log(current === text ? "EVIDENCE_CURRENT" : `DRIFT: ${GIT_EVIDENCE_REL}`);
    process.exit(current === text ? 0 : 1);
  }
  if (!process.argv.includes("--write")) { console.log("DRY_RUN: pass --write to write"); return; }
  if (current === text) { console.log("UNCHANGED"); return; }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, text);
  console.log(`WROTE ${GIT_EVIDENCE_REL}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
