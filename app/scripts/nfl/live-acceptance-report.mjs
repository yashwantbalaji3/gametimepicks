#!/usr/bin/env node
/**
 * LIVE PROPS ACCEPTANCE REPORT (Phase F · F3) — the founder's table, produced from the record.
 *
 *   node app/scripts/nfl/live-acceptance-report.mjs [--event <id>] [--family <key>] [--limit 12] [--json]
 *
 * Prints, for real rows across the supported families, exactly the fields real-game acceptance asks
 * for: the player, the family, the FROZEN sportsbook and line, our FROZEN forecast, when that price
 * was captured, the live stat, the score and clock, the provider's own instant, the final
 * measurement, the settlement, and any reconciliation or correction.
 *
 * READ-ONLY, and deliberately so. It contacts no provider and writes nothing: every field is read
 * out of the committed live artifact and the committed settlement ledger, so what it prints is what
 * the system actually published rather than what a fresh fetch would say now. If the two ever
 * disagree, the disagreement is the finding — and it would be invisible if this report did its own
 * fetch.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { slateDateEtOf } from "../../src/lib/sports/nfl/prop-settlement-ledger.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROOT = path.resolve(APP, "..");
const LIVE_DIR = path.join(APP, "public/data/nfl/live-props");
const LEDGER_DIR = path.join(ROOT, "data/internal/nfl/prop-settlement");

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const AS_JSON = process.argv.includes("--json");
const LIMIT = Number(arg("limit", "12"));
const ONLY_EVENT = arg("event");
const ONLY_FAMILY = arg("family");
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

let files = [];
try { files = fs.readdirSync(LIVE_DIR).filter((f) => f.endsWith(".json")); } catch {
  console.log("no live-prop artifacts on disk — nothing to accept yet");
  process.exit(0);
}

/* The ledger, indexed by settlementId, so a correction recorded after the fact is visible here. */
const ledgerRows = new Map();
try {
  for (const f of fs.readdirSync(LEDGER_DIR).filter((x) => x.endsWith(".json"))) {
    for (const r of read(path.join(LEDGER_DIR, f))?.rows ?? []) ledgerRows.set(r.settlementId, r);
  }
} catch { /* no ledger yet — the report still prints the live half and says so */ }

const rows = [];
for (const f of files) {
  const a = read(path.join(LIVE_DIR, f));
  if (!a?.providerEventId) continue;
  if (ONLY_EVENT && String(a.providerEventId) !== ONLY_EVENT) continue;

  for (const r of a.rows ?? []) {
    if (ONLY_FAMILY && r.family !== ONLY_FAMILY) continue;
    /* A row with no frozen block has no pregame claim to accept against — the producer refused to
       mint one, and that refusal is itself reportable rather than hidden. */
    const led = ledgerRows.get(r.predictionId) ?? null;
    rows.push({
      player: r.name,
      team: r.team,
      family: r.family,
      familyState: r.familyState ?? null,
      url: `/nfl/game/${a.providerEventId}/`,
      frozenSportsbook: r.frozen?.market?.sportsbook ?? null,
      frozenLine: r.frozen?.market?.line ?? null,
      frozenPrices: r.frozen?.market ? `${r.frozen.market.overOdds ?? "—"} / ${r.frozen.market.underOdds ?? "—"}` : null,
      pregameCaptureTime: r.frozen?.market?.capturedAt ?? null,
      forecast: r.frozen?.projection?.median ?? null,
      forecastRange: r.frozen?.projection ? `${r.frozen.projection.p10 ?? "—"}–${r.frozen.projection.p90 ?? "—"}` : null,
      forecastGeneratedAt: r.frozen?.forecastGeneratedAt ?? null,
      frozenRefusal: r.frozenRefusal ?? null,
      liveStat: r.live?.statValue ?? null,
      phase: r.live?.phase ?? null,
      clock: r.live?.clock ?? null,
      period: r.live?.period ?? null,
      score: r.live?.score ? `${r.live.score.away} – ${r.live.score.home}` : null,
      providerObservedAt: a.observedAt ?? null,
      finality: a.finality ?? null,
      finalMeasurement: r.settlement?.finalStat ?? null,
      measurementState: r.settlement?.state ?? null,
      lineResult: r.settlement?.lineResult ?? null,
      forecastResult: r.settlement?.forecastResult ?? null,
      bookRuleUnknown: r.settlement?.bookRuleUnknown === true,
      settledAt: r.settlement?.settledAt ?? null,
      /* The producer's in-window reconciliation, and the ledger's out-of-window corrections. */
      reconciliation: r.reconciliation ? `${r.reconciliation.differsFrom} → ${r.reconciliation.finalStat} at ${r.reconciliation.observedAt}` : null,
      corrections: (led?.corrections ?? []).map((c) => `${c.at}: ${Object.entries(c.changes).map(([k, v]) => `${k} ${v.from}→${v.to}`).join(", ")}`),
      inLedger: Boolean(led),
      originalAnswer: led?.original ? `${led.original.measurementState} ${led.original.lineResult ?? ""} ${led.original.forecastResult ?? ""}`.trim() : null,
    });
  }
}

/* Cover the FAMILIES, not just the first N rows — acceptance asks for several families, and a
   naive slice would return twelve receiving-yards rows and prove nothing about the rest. */
const byFamily = new Map();
for (const r of rows) {
  if (!byFamily.has(r.family)) byFamily.set(r.family, []);
  byFamily.get(r.family).push(r);
}
const perFamily = Math.max(1, Math.ceil(LIMIT / Math.max(1, byFamily.size)));
const sampled = [...byFamily.values()].flatMap((list) => {
  /* Prefer rows that actually exercise the lifecycle: a settled row first, then a live one, then an
     absence — so the report shows the interesting states rather than whoever sorts first. */
  const rank = (r) => (r.measurementState === "SETTLED" ? 0 : r.measurementState === "NO_MEASUREMENT" ? 1 : 2);
  return [...list].sort((a, b) => rank(a) - rank(b) || String(a.player).localeCompare(String(b.player))).slice(0, perFamily);
});

if (AS_JSON) { console.log(JSON.stringify({ generatedFrom: "committed artifacts + ledger", rows: sampled }, null, 1)); process.exit(0); }

if (!sampled.length) { console.log("no rows matched — nothing to accept yet"); process.exit(0); }

const slate = slateDateEtOf(read(path.join(LIVE_DIR, files[0]))?.kickoffUtc);
console.log(`\n=== NFL LIVE PROPS · ACCEPTANCE (slate ${slate ?? "?"}) ===`);
console.log(`${rows.length} row(s) on disk · showing ${sampled.length} across ${byFamily.size} famil(ies)\n`);

for (const r of sampled) {
  console.log(`${r.player} · ${r.team} · ${r.family}${r.familyState && r.familyState !== "PUBLISHED" ? ` [${r.familyState}]` : ""}`);
  console.log(`  url                ${r.url}`);
  console.log(`  frozen book/line   ${r.frozenSportsbook ?? "— not priced"} ${r.frozenLine ?? ""} ${r.frozenPrices ?? ""}`.trimEnd());
  console.log(`  frozen forecast    ${r.forecast ?? "—"} (range ${r.forecastRange ?? "—"}, board ${r.forecastGeneratedAt ?? "—"})`);
  console.log(`  pregame capture    ${r.pregameCaptureTime ?? "— no price captured"}${r.frozenRefusal ? `  ⚠ REFUSED: ${r.frozenRefusal}` : ""}`);
  console.log(`  live               ${r.liveStat ?? "—"}  ${r.phase ?? "—"}${r.period ? ` Q${r.period}` : ""}${r.clock ? ` ${r.clock}` : ""}  ${r.score ?? ""}`.trimEnd());
  console.log(`  provider observed  ${r.providerObservedAt ?? "—"}   finality ${r.finality ?? "—"}`);
  console.log(`  final / settlement ${r.finalMeasurement ?? "—"}  ${r.measurementState ?? "—"}  line=${r.lineResult ?? "—"}  forecast=${r.forecastResult ?? "—"}${r.bookRuleUnknown ? "  (book rule unknown)" : ""}`);
  console.log(`  settled at         ${r.settledAt ?? "—"}   in ledger: ${r.inLedger ? "yes" : "NO"}${r.originalAnswer ? `   original: ${r.originalAnswer}` : ""}`);
  if (r.reconciliation) console.log(`  ⚠ reconciled       ${r.reconciliation}`);
  for (const c of r.corrections) console.log(`  ⚠ corrected        ${c}`);
  console.log("");
}

const states = {};
for (const r of rows) states[r.measurementState ?? "null"] = (states[r.measurementState ?? "null"] || 0) + 1;
console.log(`states across all ${rows.length} row(s): ${JSON.stringify(states)}`);
console.log(`in ledger: ${rows.filter((r) => r.inLedger).length} · reconciled: ${rows.filter((r) => r.reconciliation).length} · corrected: ${rows.filter((r) => r.corrections.length).length}`);
