#!/usr/bin/env node
/**
 * THE SUNDAY CANDIDATE UNIVERSE — can NFL legitimately compete for a Bank Builder / Moonshot slot?
 *
 * ⚠ READ-ONLY, AND IT MUST STAY THAT WAY. It reads the FROZEN boards and the published family states
 *   and writes nothing. The frozen Sunday baseline is protected until acceptance; this command exists
 *   to describe it, never to move it.
 *
 * ⚠ IT RELAXES NO GATE. Every state comes from an artifact the producers already publish:
 *   family state from nfl/model-status.json, participation from the board row, line/price/capturedAt
 *   from the board's own frozen `market` block. `NO QUALIFYING PLAY` is a valid, correct answer.
 *
 * Usage:
 *   node app/scripts/ops/sunday-candidate-universe.mjs --date 2026-09-27
 *   node app/scripts/ops/sunday-candidate-universe.mjs --date 2026-09-27 --json
 *
 * EXIT CODES — a report describes.
 *   0  it ran   ·   2  it could not run
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateCandidate, foldUniverse, CANDIDATE_STATE, SETTLEMENT_SUPPORT } from "../../src/lib/products/candidate-universe.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const has = (n) => process.argv.includes(n);
const DATE = arg("--date");
const JSON_OUT = has("--json");
/* The contract's own bound (LEG_BOUNDS.maxPriceAgeMs). Named, not invented. */
const MAX_PRICE_AGE_MS = Number(arg("--max-price-age-hours", "12")) * 3_600_000;

const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const die = (m) => { console.error(`REFUSED: ${m}`); process.exit(2); };
if (!DATE) die("--date <YYYY-MM-DD> is required — this command never guesses a slate");

/* ── the families' OWN published states, which the product path never consulted ─────────────── */
const status = read(path.join(APP, "public/data/nfl/model-status.json"));
if (!status?.playerFamilies) die("nfl/model-status.json has no playerFamilies — cannot judge a family state");
const familyState = new Map(status.playerFamilies.map((f) => [f.key, f.state]));
/* anytimeTd sits outside playerFamilies in that artifact; its state is just as binding. */
if (status.anytimeTd?.state) familyState.set("anytime_td", status.anytimeTd.state);

const BOARDS = path.join(APP, "public/data/nfl/player-board");
if (!fs.existsSync(BOARDS)) die(`no player-board directory at ${BOARDS}`);

const boards = fs.readdirSync(BOARDS).filter((f) => /^\d+\.json$/.test(f))
  .map((f) => read(path.join(BOARDS, f)))
  .filter((b) => b?.artifact === "nfl-player-board")
  /* Sunday night games kick after midnight UTC, so the slate spans two UTC dates. */
  .filter((b) => { const k = String(b.kickoffUtc ?? ""); return k.startsWith(DATE) || k.startsWith(nextDay(DATE)); })
  .sort((a, b) => String(a.kickoffUtc).localeCompare(String(b.kickoffUtc)));

function nextDay(d) { const t = Date.parse(`${d}T00:00:00Z`); return new Date(t + 86400000).toISOString().slice(0, 10); }

if (!boards.length) {
  console.log(`NO_BOARDS — ${DATE} has no published NFL player board. A result, not a gap.`);
  process.exit(0);
}

/* asOf is the boards' OWN generation instant, never a wall clock: this describes a frozen slate. */
const asOf = boards[0].generatedAt;
const BINARY = new Set(["anytime_td"]);

/* ── settlement support, derived from the graded record and the schedule ─────────────────────── */
const graded = read(path.join(APP, "public/data/nfl/graded-picks.json"));
const gradedFamilies = new Set(
  (Array.isArray(graded?.picks) ? graded.picks : [])
    .map((r) => String(r.marketFamily ?? r.market ?? "").toLowerCase())
    .filter(Boolean),
);
/* The settler is wired into nfl-live-props.yml and nfl-event-window.yml with --write, so the
   machinery is armed even where nothing has been graded yet. Read from disk rather than asserted. */
const wfDir = path.resolve(APP, "..", ".github/workflows");
const settlerScheduled = fs.existsSync(wfDir) && fs.readdirSync(wfDir)
  .some((f) => fs.readFileSync(path.join(wfDir, f), "utf8").includes("settle-nfl-live-props.mjs"));

const FAMILY_TO_GRADED_LABEL = { player_rush_yds: "rush yards", player_reception_yds: "reception yards", player_receptions: "receptions", player_pass_yds: "pass yards", anytime_td: "anytime td" };
function settlementSupportFor(fam) {
  const label = (FAMILY_TO_GRADED_LABEL[fam] ?? fam).toLowerCase();
  if (gradedFamilies.has(fam.toLowerCase()) || gradedFamilies.has(label)) return SETTLEMENT_SUPPORT.PROVEN;
  return settlerScheduled ? SETTLEMENT_SUPPORT.SCHEDULED_UNPROVEN : SETTLEMENT_SUPPORT.UNSUPPORTED;
}

const candidates = [];
for (const b of boards) {
  for (const p of b.players ?? []) {
    for (const [fam, m] of Object.entries(p.markets ?? {})) {
      const mk = m?.market ?? null;
      candidates.push({
        sport: "nfl",
        eventId: b.providerEventId ? `nfl-${b.providerEventId}` : null,
        matchup: b.matchup ?? null,
        kickoffUtc: b.kickoffUtc ?? null,
        participantId: p.playerId ?? null,
        participant: p.name ?? null,
        team: p.team ?? null,
        marketFamily: fam,
        familyState: familyState.get(fam) ?? null,
        binary: BINARY.has(fam),
        line: mk?.line ?? null,
        price: mk?.overOdds ?? mk?.price ?? mk?.yesOdds ?? null,
        sportsbook: mk?.sportsbook ?? null,
        marketCapturedAt: mk?.capturedAt ?? null,
        /* A DISTRIBUTION, not a probability — see the contract's note on why that matters. */
        modelProjection: m?.median ?? m?.mean ?? null,
        modelProbability: m?.probability ?? null,
        probabilityBasis: m?.probability != null ? "PUBLISHED" : null,
        participation: p.participation ?? null,
        /* Derived, not assumed: PROVEN only when this family already appears in the graded record. */
        settlementSupport: settlementSupportFor(fam),
      });
    }
  }
}

const evaluated = candidates.map((c) => evaluateCandidate(c, { asOf, maxPriceAgeMs: MAX_PRICE_AGE_MS }));
const fold = foldUniverse(evaluated);

if (JSON_OUT) {
  /* Synchronous — console.log + process.exit truncates a large payload on a pipe at 65536 bytes. */
  fs.writeSync(1, JSON.stringify({
    artifact: "sunday-candidate-universe", readOnly: true, relaxesNoGate: true,
    date: DATE, asOf, boards: boards.length, maxPriceAgeHours: MAX_PRICE_AGE_MS / 3_600_000,
    familyStates: Object.fromEntries(familyState),
    fold, candidates: evaluated,
  }, null, 1) + "\n");
  process.exit(0);
}

console.log(`SUNDAY CANDIDATE UNIVERSE · ${DATE} · ${boards.length} board(s) · asOf ${asOf}`);
console.log("READ-ONLY. No gate relaxed; every state comes from an artifact the producers publish.\n");

console.log("FAMILY STATES (from nfl/model-status.json — the states the product path never consulted):");
for (const [k, v] of [...familyState].sort()) {
  const cleared = ["PUBLISHED", "VALIDATED_PICK", "ADOPTED"].includes(v);
  console.log(`  ${cleared ? "✓" : "✗"} ${k.padEnd(22)} ${v}`);
}

console.log(`\nCANDIDATES · ${fold.total} rows → ${fold.eligible} eligible · ${fold.rejected} rejected`);
console.log(`VERDICT: ${fold.verdict}\n`);

console.log("by PRIMARY blocking state:");
for (const [s, n] of Object.entries(fold.byPrimary).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${s}`);
}

console.log("\nby FAMILY:");
for (const [f, v] of Object.entries(fold.byFamily).sort((a, b) => b[1].total - a[1].total)) {
  console.log(`  ${f.padEnd(30)} ${String(v.total).padStart(4)} rows · ${v.eligible} eligible · state=${v.familyState}`);
}

/* The distribution of ALL failing gates, so no leg looks one fix from eligible when it is four. */
const allGates = {};
for (const e of evaluated) for (const s of e.states) if (s !== CANDIDATE_STATE.ELIGIBLE) allGates[s] = (allGates[s] ?? 0) + 1;
const settleMix = {};
for (const e of evaluated) settleMix[e.settlementSupport] = (settleMix[e.settlementSupport] ?? 0) + 1;
console.log("\nsettlement support (tri-state — \"prove it once\" is not \"build it\"):");
for (const [k, n] of Object.entries(settleMix).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);

console.log("\nEVERY failing gate (a row can fail several — a first-fail count would mislead):");
for (const [s, n] of Object.entries(allGates).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${s}`);

if (fold.eligible === 0) {
  console.log("\nNO QUALIFYING PLAY for NFL on this slate — a correct output, not a failure.");
  console.log("Producing one would have required ignoring a gate, which is the one thing forbidden here.");
}
process.exit(0);
