#!/usr/bin/env node
/**
 * Daily WORLD CUP SPECIALS refresh. Builds the current slate's 5 cards via the shared engine
 * (`buildWorldCupSpecials`) — which falls back to TEAM models when player props are unavailable — and
 * writes `world-cup/world-cup-specials.json`, archiving the prior slate into the history file first.
 *
 *   npx tsx app/scripts/refresh-world-cup-specials.mjs --date 2026-06-24
 *
 * Real odds only (fail-closed). NEVER mutates bankroll/crown/records — WC Specials is a separate paper
 * product with its own ledger.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildWorldCupSpecials } from "../src/lib/world-cup/world-cup-specials.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."); // .../app — run via tsx from app/ so the @/ alias resolves
const args = process.argv.slice(2);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const date = val("--date", new Date().toISOString().slice(0, 10));
const nowIso = `${date}T08:00:00Z`;
const root = path.join(APP, "public", "data", "world-cup");
const SPECIALS = path.join(root, "world-cup-specials.json");
const HISTORY = path.join(root, "world-cup-specials-history.json");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

// 1. Archive the prior slate (if it isn't the current one and isn't already in history).
const prior = readJson(SPECIALS);
if (prior && prior.date && prior.date !== date) {
  const hist = readJson(HISTORY) ?? { version: "world-cup-specials-history-v1", days: [] };
  if (!hist.days.some((d) => d.date === prior.date)) {
    hist.days.push({ date: prior.date, cardCount: (prior.cards ?? []).length, cards: (prior.cards ?? []).map((c) => ({ id: c.id, combinedOdds: c.combinedOdds, legs: c.legs })) });
    hist.days.sort((a, b) => a.date.localeCompare(b.date));
    fs.writeFileSync(HISTORY, JSON.stringify(hist, null, 2) + "\n");
    console.log(`  archived ${prior.date} (${(prior.cards ?? []).length} cards) → history`);
  }
}

// 2. Build + write the current slate.
const result = buildWorldCupSpecials({ root: path.join(APP, "public", "data"), nowIso, date });
fs.writeFileSync(SPECIALS, JSON.stringify(result, null, 2) + "\n");

console.log(`=== World Cup Specials · ${date} ===`);
console.log(`  ${result.cards.length} card(s)${result.diagnostics.playerPropsUnavailable ? " · TEAM-MODEL fallback (player props unavailable)" : ""}`);
for (const c of result.cards) console.log(`    ${c.legs.length} legs · +${c.combinedOdds} · $${c.stakePreview ?? c.stake}`);
console.log(`  → wrote ${path.relative(process.cwd(), SPECIALS)}`);
