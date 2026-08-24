#!/usr/bin/env node
/**
 * UFC CARD POPULATION AUDIT — prove the published card equals the provider's own event
 * (Program 197 · Release A1).
 *
 *   npx tsx scripts/ufc/audit-ufc-card-population.mjs --now <ISO> [--write]
 *
 * Fetches the authoritative event fresh (ESPN public scoreboard, limit=1000 — the parameter whose
 * absence served 7 of 13 bouts as a complete-looking card), reconciles it against card-latest and
 * the newest pre-fight snapshot, and writes a dated population receipt with expected / captured /
 * read / priced / missing / phantom counts plus a typed per-bout input matrix. Exits 2 when the
 * populations do not reconcile — a shrunken card fails visibly, never quietly.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { reconcileCardPopulation } from "../../src/lib/sports/ufc/card-population.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const arg = (n) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null; };
const NOW = arg("--now");
const WRITE = process.argv.includes("--write");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const card = readJson(path.join(APP, "public/data/ufc/card-latest.json"));
if (!card?.event?.providerEventId) { console.error("REFUSED: no current card artifact — nothing to audit"); process.exit(1); }

/* Newest pre-fight snapshot for the card's event, for the priced population. */
const snapDir = path.join(ROOT, "data/internal/research/ufc/model-vs-market");
let snapshot = { rows: [] };
try {
  const files = fs.readdirSync(snapDir).filter((f) => /^snapshot-\d{12}\.json$/.test(f)).sort().reverse();
  for (const f of files) {
    const s = readJson(path.join(snapDir, f));
    if (String(s?.event?.slateDate ?? "") === String(card.event.slateDate)) { snapshot = s; break; }
  }
} catch { /* no snapshots yet — priced counts read zero, honestly */ }

/* The authority: the provider's own event, fetched fresh. A fetch failure is SOURCE_STALE, not a pass. */
const day = String(card.event.slateDate ?? "").replaceAll("-", "");
const url = `https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=${day}&limit=1000`;
let authoritative = null;
try {
  const res = await fetch(url);
  const data = JSON.parse(await res.text());
  const ev = (data.events ?? []).find((e) => String(e.id) === String(card.event.providerEventId));
  if (ev) {
    authoritative = {
      providerEventId: String(ev.id),
      name: ev.name ?? null,
      bouts: (ev.competitions ?? []).map((c) => ({
        providerBoutId: String(c.id),
        red: c.competitors?.[0]?.athlete?.displayName ?? null,
        blue: c.competitors?.[1]?.athlete?.displayName ?? null,
      })).filter((b) => b.red && b.blue),
    };
  }
} catch { /* handled below */ }
if (!authoritative) {
  console.log("SOURCE_STALE: could not fetch the authoritative event — no receipt written, last-known-good stands");
  process.exit(0);
}

const out = reconcileCardPopulation({ authoritative, card, snapshot });
const c = out.counts;
console.log(`\nUFC card population · ${out.event.name} (${out.event.providerEventId})`);
console.log(`  expected ${c.expected} · captured ${c.captured} · read ${c.read} · unmodelled ${c.unmodelled} · priced ${c.priced} · missing ${c.missing} · phantom ${c.phantom}`);
for (const m of out.missing) console.log(`  MISSING  ${m.pair} — ${m.reason}`);
for (const p of out.phantom) console.log(`  PHANTOM  ${p.boutId} — ${p.reason}`);
console.log(`  population-exact: ${out.populationExact}`);

if (WRITE) {
  const dir = path.join(ROOT, "data/internal/research/ufc/population");
  fs.mkdirSync(dir, { recursive: true });
  const receipt = { schemaVersion: 1, artifact: "ufc-card-population-receipt", dataClass: "INTERNAL_RESEARCH", public: false, generatedAt: NOW, ...out };
  fs.writeFileSync(path.join(dir, `${card.event.slateDate}.json`), JSON.stringify(receipt, null, 1) + "\n");
  console.log(`  → wrote data/internal/research/ufc/population/${card.event.slateDate}.json`);
}
process.exit(out.populationExact ? 0 : 2);
