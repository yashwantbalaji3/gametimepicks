/**
 * NFL current-artifact settlement (Program 171 · Release H). PRIVATE PAPER RECORD.
 *
 * Settles the pre-kickoff current artifacts EXACTLY ONCE against official finals, using the
 * deployed P161 grading contract. This is a SEPARATE paper record: it can never touch MLB money,
 * Bank Builder, Moonshot, or Mr. Dub — the repo has one money settlement writer (nightly-settle)
 * and this is not it.
 *
 * WHAT SETTLES: the model reading is preseason-ABSTAIN, so what these artifacts actually pin is
 * the pre-start MARKET consensus (moneyline favourite, spread, total). Grading it produces a
 * market-accuracy record — honestly labelled as such, never as model performance.
 *
 * EXACTLY-ONCE: a receipt keyed by canonicalEventId refuses a second settlement; corrections
 * append lineage instead of regrading. An artifact whose evidence is not strictly pre-kickoff
 * cannot settle at all (the contract already refused to write it).
 *
 * Usage: node scripts/nfl/settle-nfl-current.mjs --now <iso> [--date YYYY-MM-DD]
 * Writes: data/internal/nfl/settlement/<date>.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { gradeNflLeg, settleNflSlate, NFL_SETTLEMENT_CONTRACT_VERSION } from "../../src/lib/sports/nfl/settlement-contract.mjs";
import { validateCurrentEventArtifact } from "../../src/lib/sports/nfl/current-event-contract.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const DATE = arg("--date", NOW.slice(0, 10));
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

// ---------------------------------------------------------------- artifacts for the date
const dir = path.join(ROOT, "data/internal/nfl/current", DATE);
if (!fs.existsSync(dir)) { console.log(`NOT_YET_OBSERVABLE: no current artifacts for ${DATE}`); process.exit(0); }
// one artifact per event: the LATEST pre-kickoff stamp is the settling snapshot (append-only
// history is preserved on disk; settlement names exactly which file it graded).
const byEvent = new Map();
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  const a = read(path.join(dir, f));
  if (!a || !validateCurrentEventArtifact(a).ok) continue;
  byEvent.set(a.providerEventId, { file: f, a });
}

const results = read(path.join(APP, "public/data/nfl/results/latest.json"));
const resultRows = new Map((results?.rows ?? []).map((r) => [r.providerEventId, r]));

const nowMs = Date.parse(NOW);
const receiptPath = path.join(ROOT, "data/internal/nfl/settlement", `${DATE}.json`);
const prior = read(receiptPath);
const settledAlready = new Set((prior?.events ?? []).map((e) => e.canonicalEventId));

const events = [];
const pending = [];
for (const [providerEventId, { file, a }] of byEvent) {
  if (settledAlready.has(a.canonicalEventId)) continue; // exactly once
  const kickoff = Date.parse(a.kickoffUtc);
  if (nowMs < kickoff) { pending.push({ canonicalEventId: a.canonicalEventId, matchup: a.matchup, state: "PRE_KICKOFF", kickoffUtc: a.kickoffUtc }); continue; }
  const r = resultRows.get(providerEventId);
  if (!r || !/^STATUS_FINAL/.test(r.statusRaw ?? "")) {
    pending.push({ canonicalEventId: a.canonicalEventId, matchup: a.matchup, state: "AWAITING_OFFICIAL_RESULT", kickoffUtc: a.kickoffUtc, observedStatus: r?.statusRaw ?? "no result row" });
    continue; // pending is never a loss
  }
  const t = a.settlementTargets;
  if (!t) { pending.push({ canonicalEventId: a.canonicalEventId, matchup: a.matchup, state: "NO_TARGETS", kickoffUtc: a.kickoffUtc }); continue; }

  const official = { status: r.statusRaw, homePointsFT: r.ftHome, awayPointsFT: r.ftAway };
  // The market's own reading, graded: the side its no-vig probability favoured, its spread, its total.
  const favourite = t.moneylineNoVig.home >= t.moneylineNoVig.away ? "home" : "away";
  const legs = [
    { providerEventId, market: "moneyline", side: favourite, label: `market favourite (${(Math.max(t.moneylineNoVig.home, t.moneylineNoVig.away) * 100).toFixed(1)}% no-vig)` },
    { providerEventId, market: "point_spread", side: "home", line: t.spreadHome, label: `home ${t.spreadHome > 0 ? "+" : ""}${t.spreadHome}` },
    { providerEventId, market: "total_points", side: "over", line: t.total, label: `over ${t.total}` },
  ];
  const graded = legs.map((l) => ({ market: l.market, side: l.side, line: l.line ?? null, label: l.label, ...gradeNflLeg(l, official) }));
  events.push({
    canonicalEventId: a.canonicalEventId,
    providerEventId,
    matchup: a.matchup,
    kickoffUtc: a.kickoffUtc,
    artifactFile: `data/internal/nfl/current/${DATE}/${file}`,
    lineage: {
      artifactGeneratedAt: a.generatedAt,
      marketCapturedAt: t.capturedAt,
      evidence: a.evidence,
      settlementContractVersion: NFL_SETTLEMENT_CONTRACT_VERSION,
      settledAt: NOW,
    },
    official: { status: r.statusRaw, home: r.ftHome, away: r.ftAway },
    graded,
  });
}

const allEvents = [...(prior?.events ?? []), ...events];
const allGraded = allEvents.flatMap((e) => e.graded);
const tally = (o) => allGraded.filter((g) => g.outcome === o).length;
const decisive = tally("WIN") + tally("LOSS");

const receipt = {
  schemaVersion: 1,
  artifact: "nfl-current-settlement",
  dataClass: "PRIVATE_PAPER_RECORD",
  date: DATE,
  generatedAt: NOW,
  scope: "NFL current-artifact settlement — a SEPARATE paper record. It never reads or writes MLB money, Bank Builder, Moonshot, or Mr. Dub.",
  whatIsGraded: "the PRE-START MARKET consensus pinned in each artifact (favourite / home spread / over total). The team model ABSTAINS in preseason, so this is a market-accuracy record and is never reported as model performance.",
  events: allEvents,
  pending,
  accounting: {
    artifactsForDate: byEvent.size,
    settled: allEvents.length,
    pending: pending.length,
    reconciles: allEvents.length + pending.length === byEvent.size,
    legs: allGraded.length,
    wins: tally("WIN"),
    losses: tally("LOSS"),
    pushes: tally("PUSH"),
    voids: tally("VOID_PENDING_REVIEW"),
    decisive,
    note: "decisive = WIN + LOSS only; pushes and voids are reported separately and pending is never a loss",
  },
};
if (!receipt.accounting.reconciles) { console.error(`REFUSED: population gap — ${byEvent.size} artifacts ≠ ${allEvents.length} settled + ${pending.length} pending`); process.exit(2); }

fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 1));
console.log(`settlement ${DATE}: ${events.length} newly settled (${allEvents.length} total), ${pending.length} pending`);
for (const e of events) console.log(`  ${e.matchup} ${e.official.away}-${e.official.home}: ${e.graded.map((g) => `${g.market}=${g.outcome}`).join(" ")}`);
if (!events.length && pending.length) console.log(`NOT_YET_OBSERVABLE: ${pending[0].state} — ${pending[0].matchup} at ${pending[0].kickoffUtc}`);
