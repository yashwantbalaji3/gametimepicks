/**
 * Compose adapter output into THE ledger: one row per forecastId, validated, deterministically ordered. Pure.
 *
 * Exactly once. Sources are given in priority order. A forecast that two sources hold (an NFL prop on both the prop
 * ledger and a Top-5 receipt) becomes ONE row from the higher-priority owner; the other surface is recorded in
 * `provenance.alsoPublishedOn`, never as a second observation. Two rows with the same id from the SAME source is an
 * owner defect and fails the build — the ledger never picks one silently.
 */
import { validateRow } from "./contract.mjs";
import { fnv1a64 } from "./identity.mjs";

/** JSON with keys in insertion order — rows are built in canonical order, so this is stable. */
export const serializeRow = (row) => JSON.stringify(row);

export function composeLedger(sources) {
  const byId = new Map();
  const problems = [];
  for (const { source, rows } of sources) {
    const seenHere = new Set();
    for (const r of rows) {
      if (seenHere.has(r.forecastId)) {
        problems.push(`${source}: duplicate forecastId ${r.forecastId} (${r.sport} ${r.eventId} ${r.subjectId} ${r.family})`);
        continue;
      }
      seenHere.add(r.forecastId);
      const held = byId.get(r.forecastId);
      if (held) {
        held.provenance.alsoPublishedOn = [...new Set([...held.provenance.alsoPublishedOn, source])].sort();
        continue;
      }
      const row = { ...r, provenance: { owner: source, alsoPublishedOn: [], notes: r.provenance?.notes ?? [] } };
      const v = validateRow(row);
      if (v.length) {
        problems.push(`${source}: ${r.forecastId} ${r.sport} ${r.eventId} ${r.subjectId} ${r.family}: ${v.join("; ")}`);
        continue;
      }
      byId.set(r.forecastId, row);
    }
  }
  if (problems.length) {
    const head = problems.slice(0, 20).join("\n  ");
    throw new Error(`forecast ledger refused (${problems.length} problem(s)):\n  ${head}`);
  }
  return [...byId.values()].sort((a, b) => (a.forecastId < b.forecastId ? -1 : a.forecastId > b.forecastId ? 1 : 0));
}

/**
 * Published families that are NOT (yet) ledger rows, and why — the honest coverage boundary (Phase A / G). A Results
 * page reads this list rather than implying the ledger is complete.
 */
export const DECLARED_GAPS = Object.freeze([
  { sport: "NFL", family: "player props (before 2026-09-20) — unresolved names only", reason: "Week 1 and Week 2 Thursday props come from the week reconciliation through an exact roster crosswalk (latest capture before kickoff, unique full name on the team). A row whose name matches no one, or several people, on that roster is left out rather than guessed." },
  { sport: "NFL", family: "nfl_score_shape", reason: "Key-number, tie, overtime and exact-score chances are published, but the file is overwritten on every run, so no frozen pre-kickoff copy exists to grade (only git history). Overtime cannot be settled at all yet: no captured result records whether a game went to overtime. Needs a write-once pre-kickoff receipt first." },
  { sport: "MLB", family: "player-prop leans", reason: "Every MLB prop market is DEMOTED to market context (RESEARCH), so it is not public forecast history." },
  { sport: "EPL", family: "double chance", reason: "Not a separate observation: each double-chance number is exactly 1 − one 1X2 class, so it is already measured inside the 1X2 family (its Brier terms are the 1X2 Brier's). Counting it again would score the same forecast twice." },
  { sport: "UFC", family: "method / round", reason: "Published, but the official results we capture by fight id (ESPN) record only the winner; method and round exist only in a source keyed by fighter names, and the pre-fight snapshots freeze only the winner chance. Grading would mean joining fights by name, which the UFC identity gate does not allow yet." },
  { sport: "NBA", family: "game model (v0 / v0.1)", reason: "SHADOW / PRIVATE_RESEARCH — never public forecast history." },
]);

function count(rows, key) {
  const out = {};
  for (const r of rows) {
    const k = key(r);
    out[k] = (out[k] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** Content-derived manifest: no wall clock, so unchanged sources give byte-identical output. */
export function buildManifest(rows, { schemaVersion, sportFiles }) {
  const sports = {};
  for (const [sport, file] of Object.entries(sportFiles)) {
    const rs = rows.filter((r) => r.sport === sport);
    const settledAts = rs.map((r) => r.settlement.settledAt).filter(Boolean).sort();
    sports[sport] = {
      file,
      rows: rs.length,
      contentHash: fnv1a64(rs.map(serializeRow).join("\n")),
      families: count(rs, (r) => r.family),
      settlement: count(rs, (r) => r.settlement.state),
      publication: count(rs, (r) => r.publicationStatus),
      recoverability: count(rs, (r) => r.recoverability),
      latestSettledAt: settledAts.length ? settledAts[settledAts.length - 1] : null,
    };
  }
  return {
    schemaVersion,
    artifact: "forecast-ledger",
    dataClass: "PUBLIC_DERIVED",
    rule: "One row per published/frozen forecast observation, read from its owner; append-only; missing stays missing.",
    totals: {
      rows: rows.length,
      settlement: count(rows, (r) => r.settlement.state),
      publication: count(rows, (r) => r.publicationStatus),
    },
    sports,
    declaredGaps: DECLARED_GAPS,
  };
}
