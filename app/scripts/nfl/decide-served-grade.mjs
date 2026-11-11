#!/usr/bin/env node
/**
 * NFL GRADE RULE · DECIDE (founder 2026-11-09; Option B). After kickoff, for every game the served rule covers
 * (kickoff ≥ NFL_SERVED_GRADE_FROM), resolves which forecast revision Production SERVED at kickoff
 * (publication-evidence/served-revision.mjs over a GitHub deployment record) and writes one write-once decision:
 * GRADE (the frozen revision, or a valid late replacement) or HOLD with its reason. Internal, not a build input.
 *
 *   npx tsx scripts/nfl/decide-served-grade.mjs --now <ISO> --deployments <capture file> [--write]
 *   npx tsx scripts/nfl/decide-served-grade.mjs --now <ISO> --deployments <file> --from <ISO>   DRY RUN over earlier games
 *                                                     (refused with --write: history is never decided under the new rule)
 *
 * A game is decided only once the deployment record covers its kickoff plus the record's lateness (7 min) — before that
 * it waits (no record), so a late capture can never become a permanent EVIDENCE_GAP hold. The decision embeds the
 * deployments it rests on, so it can be re-checked without the capture. Nothing graded before the rule is touched.
 *
 *   candidates  every committed revision receipt of the game (recorded) and every revision a READY build's public
 *               union carried in the 8 days before kickoff (served copies, possibly without a receipt)
 *   served      the game's forecast in the build's public union (forecasts/latest.json, else frozen-latest.json)
 *   cutoff      the scheduled kickoff (no actual NFL start is captured; stated as the basis)
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { NFL_SERVED_GRADE_FROM, RECORD_CLOCK, decideGradedRevision, nflForecastContentHash, servedWithNearCutoffResolved } from "../../src/lib/sports/nfl/served-grade.mjs";
import { decisionPath, readDecision, readFreezeRecord, writeOnce } from "../../src/lib/sports/nfl/served-grade-io.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const ms = (iso) => { const t = Date.parse(String(iso ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z")); return Number.isFinite(t) ? t : null; };

const NOW = arg("--now");
const DEPLOY_FILE = arg("--deployments");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(2); }
if (!DEPLOY_FILE) { console.error("REFUSED: --deployments <file> required"); process.exit(2); }
const FROM = arg("--from") ?? NFL_SERVED_GRADE_FROM;
if (FROM !== NFL_SERVED_GRADE_FROM && process.argv.includes("--write")) { console.error("REFUSED: --from is a dry run; decisions are written only for games the rule covers"); process.exit(2); }
const record = readJson(path.resolve(DEPLOY_FILE));
if (!record?.window || !Array.isArray(record.deployments)) { console.error("EVIDENCE_GAP: unreadable deployment record — nothing decided"); process.exit(3); }
const deployments = record.deployments.map((d) => ({ id: String(d.id), sha: d.sha, readyAt: d.readyAt ?? null, state: d.state, createdAt: d.createdAt ?? null }));

/* revision receipts per game (the recorded candidates) */
const RECEIPTS = path.join(ROOT, "data/internal/nfl/forecast-receipts");
const receiptsOf = new Map();
for (const d of fs.existsSync(RECEIPTS) ? fs.readdirSync(RECEIPTS).sort() : []) {
  const dir = path.join(RECEIPTS, d);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const r = readJson(path.join(dir, f));
    if (r?.providerEventId && r.generatedAt) (receiptsOf.get(String(r.providerEventId)) ?? receiptsOf.set(String(r.providerEventId), []).get(String(r.providerEventId))).push({ file: `data/internal/nfl/forecast-receipts/${d}/${f}`, r });
  }
}

/* what each build served: the public union at that commit (cached per sha) */
const unionAt = new Map();
function servedUnion(sha) {
  if (unionAt.has(sha)) return unionAt.get(sha);
  const show = (rel) => { try { return JSON.parse(execFileSync("git", ["show", `${sha}:${rel}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 2e8, stdio: ["ignore", "pipe", "ignore"] })); } catch { return null; } };
  const latest = show("app/public/data/nfl/forecasts/latest.json");
  const frozen = show("app/public/data/nfl/forecasts/frozen-latest.json");
  const v = latest || frozen ? { latest, frozen } : null;
  unionAt.set(sha, v);
  return v;
}
const pickGame = (u, id) => { const f = (doc) => (doc?.forecasts ?? []).find((x) => String(x.providerEventId) === id) ?? null; return f(u?.latest) ?? f(u?.frozen); };

const due = [];
for (const [id, revs] of receiptsOf) {
  const kick = revs.map((x) => x.r.kickoffUtc).filter(Boolean).sort().at(-1);
  if (!(ms(kick) >= ms(FROM)) || !(ms(kick) < ms(NOW))) continue;
  if (readDecision(ROOT, id)) continue; // decided once
  // wait until the record covers the kickoff plus its lateness; never decide on a record that cannot see it
  if (!(Date.parse(record.window.to) >= ms(kick) + RECORD_CLOCK.lateMs + 60_000)) { console.log(`${id}: WAIT — the deployment record ends ${record.window.to}`); continue; }
  due.push({ id, kick, revs });
}

const out = { WROTE: 0, UNCHANGED: 0, CONFLICT: 0, DRY_RUN: 0 };
for (const { id, kick, revs } of due.sort((a, b) => a.kick.localeCompare(b.kick) || a.id.localeCompare(b.id))) {
  const kMs = ms(kick);
  const byHash = new Map();
  for (const { file, r } of revs.sort((a, b) => ms(a.r.generatedAt) - ms(b.r.generatedAt))) {
    const h = nflForecastContentHash(r);
    if (h && !byHash.has(h)) byHash.set(h, { id: file, generatedAt: r.generatedAt, contentHash: h, recorded: true, forecast: r });
  }
  const window = deployments.filter((d) => d.state === "READY" && ms(d.readyAt) > kMs - 8 * 864e5 && ms(d.readyAt) < kMs + 3600e3);
  for (const d of window) {
    const x = pickGame(servedUnion(d.sha), id);
    const h = nflForecastContentHash(x);
    if (h && !byHash.has(h)) byHash.set(h, { id: `union@${d.sha.slice(0, 10)}`, generatedAt: x.generatedAt, contentHash: h, recorded: false, forecast: x });
  }
  const candidates = [...byHash.values()];
  const served = servedWithNearCutoffResolved({
    start: { scheduledStarts: [...new Set(revs.map((x) => x.r.kickoffUtc).filter(Boolean))].map((k) => k.replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z")) },
    deployments, evidenceWindow: record.window,
    servedAt: (sha) => { const u = servedUnion(sha); return u ? { ok: true, game: pickGame(u, id) } : { ok: false }; },
    candidates, hashOf: nflForecastContentHash, recordClock: RECORD_CLOCK,
  });
  const decision = decideGradedRevision({ eventId: id, kickoffUtc: kick, freeze: readFreezeRecord(ROOT, id), served, candidates, ruleFrom: FROM });
  // the evidence the decision rests on: the record's identity and the READY deployments in the last day before kickoff
  decision.evidence = {
    record: { source: record.source ?? null, capturedAt: record.capturedAt ?? null, window: record.window },
    deployments: window.filter((d) => ms(d.readyAt) > kMs - 864e5).map((d) => ({ id: d.id, sha: d.sha, readyAt: d.readyAt })),
  };
  const res = process.argv.includes("--write") ? writeOnce(decisionPath(ROOT, id), decision) : "DRY_RUN";
  out[res] += 1;
  console.log(`${id} kick ${kick}: ${decision.decision}${decision.basis ? ` ${decision.basis}` : ""}${decision.reason ? ` ${decision.reason}` : ""} · served ${served.status}${served.nearCutoffResolved ? " (near-cutoff resolved: same bytes)" : ""} · ${res}`);
}
console.log(`served-grade decisions: ${JSON.stringify(out)} (record ${record.window.from} → ${record.window.to})`);
if (out.CONFLICT) { console.error("::error::a decision on file differs from this run's — write-once kept the existing one"); process.exit(1); }
