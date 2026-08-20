/**
 * UFC 330 shadow preflight (Program 167 · Release F) — per-bout decision-ladder states from the
 * newest two COMMITTED schedule captures + corpus fit. PRIVATE RESEARCH artifact for the weekend
 * runbook.
 *
 * Probabilities exist here only when an AUTHORIZED per-book odds snapshot is on disk. That sentence
 * used to read "probabilities cannot exist here by construction", which was true only because this
 * script never passed `oddsSnapshot` — the de-vig path was written, tested, and reachable from
 * nothing, so every bout reported READY_EXCEPT_ODDS while the paid capture reported success. The
 * snapshot is now read if present and withheld if absent; READY_EXCEPT_ODDS and ABSTAIN still carry
 * no probabilities, and public activation stays OFF either way.
 *
 * Usage: node scripts/ufc/ufc330-shadow-preflight.mjs --now <iso> [--card 600059185]
 * Writes: data/internal/research/ufc/reports/ufc330-preflight.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fitUfcV1 } from "../../src/lib/sports/ufc/model-v1.mjs";
import { runUfcShadow } from "../../src/lib/sports/ufc/shadow-run.mjs";
import { withProviderBoutId } from "../../src/lib/sports/ufc/odds-snapshot.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
const CARD = arg("--card", "600059185");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("usage: ufc330-shadow-preflight.mjs --now <iso> [--card <providerEventId>]"); process.exit(1); }

const dir = path.join(APP, "public/data/ufc/schedule");
const files = fs.readdirSync(dir).filter((f) => f.startsWith("capture-")).sort();
if (files.length < 2) { console.error("need two committed schedule captures for lineage"); process.exit(2); }
const prev = JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 2]), "utf8"));
const next = JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), "utf8"));

const corpus = JSON.parse(fs.readFileSync(path.join(APP, "..", "data/internal/research/ufc/corpus-v1.json"), "utf8"));
const fit = fitUfcV1(corpus.rows);

const bouts = (next.bouts ?? []).filter((b) => b.eventProviderId === CARD);
if (bouts.length === 0) { console.error(`no bouts for card ${CARD} in the newest capture`); process.exit(3); }

/*
 * The authorized per-book snapshot, if the capture has run. ABSENT IS A VALID STATE: without it every
 * bout lands on READY_EXCEPT_ODDS with its reason stated, which is honest. It is never approximated
 * from the public median — that would invent a bookmaker that posted no price.
 */
const SNAP = path.join(APP, "..", "data/internal/research/odds/ufc/shadow-snapshot-latest.json");
const oddsSnapshot = fs.existsSync(SNAP) ? JSON.parse(fs.readFileSync(SNAP, "utf8")) : null;
console.log(oddsSnapshot
  ? `odds snapshot ${oddsSnapshot.capturedAt} · ${oddsSnapshot.rows?.length ?? 0} per-book h2h row(s)`
  : "no authorized odds snapshot on disk — probabilities withheld, not approximated");

const rows = bouts.map((b) => {
  const bout = withProviderBoutId(b);
  const out = runUfcShadow({ bout, nowIso: NOW, fit, prevCapture: prev, nextCapture: next, oddsSnapshot });
  return { providerBoutId: bout.providerBoutId, matchup: `${bout.red} vs ${bout.blue}`, weightClass: bout.weightClass ?? null, startUtc: bout.dateUtc, state: out.state, rule: out.rule ?? null, reason: out.reason ?? null, bookmakers: out.artifact?.market?.bookmakers?.length ?? 0 };
});

const counts = {};
for (const r of rows) counts[r.state] = (counts[r.state] ?? 0) + 1;

const artifact = {
  schemaVersion: 1,
  artifact: "ufc330-shadow-preflight",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  card: { providerEventId: CARD, capturePair: [prev.generatedAt, next.generatedAt] },
  counts,
  rows,
  notes: [
    "states only — no probabilities can exist without an authorized odds snapshot",
    "CARD_UNCERTAIN abstentions cite lineage; weigh-in facts are MISSING by matrix and never substituted",
    "re-run after each cadence; the fight-day run is the freeze-window preflight",
  ],
};
const outPath = path.join(APP, "..", "data/internal/research/ufc/reports/ufc330-preflight.json");
fs.writeFileSync(outPath, JSON.stringify(artifact, null, 1) + "\n");
console.log(`card ${CARD}: ${rows.length} bouts → ${JSON.stringify(counts)}`);
for (const r of rows) console.log(`  ${r.state}${r.rule ? `(${r.rule})` : ""} · ${r.matchup}`);
console.log(`wrote ${path.relative(path.join(APP, ".."), outPath)}`);
