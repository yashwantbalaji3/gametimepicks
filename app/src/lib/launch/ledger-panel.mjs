/**
 * The ledger-health panel's data, read from the committed artifacts.
 *
 * Thin by design: `lib/ledgers/ledger-health.mjs` owns every judgement, this only finds the files.
 * A panel that re-derived any of it would be a sixth opinion about records whose whole point is
 * that there are exactly five.
 */
import fs from "node:fs";
import path from "node:path";

import { buildLedgerHealth } from "../ledgers/ledger-health.mjs";

const SPORTS = ["mlb", "nfl", "ufc", "epl"];

export function buildLedgerPanel({ appDir }) {
  const DATA = path.join(appDir, "public", "data");
  const read = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8")); } catch { return null; } };

  const gradedBySport = {};
  for (const s of SPORTS) {
    const a = read(`${s}/graded-picks.json`);
    // Absent is reported by the reconciler as a contradiction, not skipped — a ledger that stopped
    // being written must not vanish quietly from the panel that watches it.
    if (a !== null) gradedBySport[s] = a;
  }
  const labLedger = read("parlays/lab-ledger.json");
  const bankBuilderLedger = read("bank-builder/ledger-latest.json");
  const moonshotLedger = read("product-ledger/moonshot.json");

  const missing = [
    Object.keys(gradedBySport).length ? null : "graded-picks (all sports)",
    labLedger ? null : "parlays/lab-ledger.json",
    bankBuilderLedger ? null : "bank-builder/ledger-latest.json",
    moonshotLedger ? null : "product-ledger/moonshot.json",
  ].filter(Boolean);

  if (missing.length) {
    return { present: false, finding: `ledger artifacts absent: ${missing.join(", ")}`, state: "UNKNOWN", rows: [], contradictions: [] };
  }

  const h = buildLedgerHealth({ gradedBySport, labLedger, bankBuilderLedger, moonshotLedger });
  const { allPicks, cards, bankBuilder, moonshot } = h.ledgers;

  /*
   * One row per LEDGER, never a total row. Five products with five stakes and five rules have no
   * meaningful common sum, and a totals row is where a blended record would first appear.
   */
  const rows = [
    {
      ledger: "All model picks",
      partition: "date / sport / market",
      settled: allPicks.graded,
      pending: allPicks.pending,
      detail: SPORTS.filter((s) => allPicks.sports[s]).map((s) => `${s}:${allPicks.sports[s].hit}-${allPicks.sports[s].miss}`).join(" · ") || "—",
    },
    ...(cards.suggested ?? []).map((st) => ({
      ledger: `Suggested cards · ${st.id.toUpperCase()}`,
      partition: "date / sport / risk",
      settled: st.settled,
      pending: null,
      detail: st.blocked ? `blocked — ${String(st.blocked).slice(0, 90)}` : `${st.wins}W ${st.losses}L ${st.pushes}P over ${st.settledDays} settled day(s)`,
    })),
    {
      ledger: "Mixed-sport cards",
      partition: "date / risk / earliest lock",
      settled: cards.mixed?.settled ?? 0,
      pending: null,
      detail: cards.mixed ? `${cards.mixed.wins}W ${cards.mixed.losses}L ${cards.mixed.pushes}P` : "stream absent",
    },
    {
      ledger: "Bank Builder",
      partition: "cycle / lane / step",
      settled: bankBuilder.settled,
      pending: bankBuilder.pending,
      detail: `${bankBuilder.win}W ${bankBuilder.loss}L across ${bankBuilder.entries} entr(ies)`,
    },
    {
      ledger: "Moonshot",
      partition: "cycle / day / card",
      settled: moonshot.settled,
      pending: null,
      detail: `${moonshot.won}W ${moonshot.lost}L`,
    },
  ];

  return { present: true, state: h.state, rows, contradictions: h.contradictions };
}
