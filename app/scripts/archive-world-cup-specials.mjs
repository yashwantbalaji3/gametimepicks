#!/usr/bin/env node
/**
 * World Cup Specials history archiver.
 *
 * Specials are a paper-only, $0-exposure suggestion feature whose daily snapshot file
 * (world-cup-specials.json) is OVERWRITTEN each slate — so yesterday's cards vanish. This script
 * persists each slate into a durable, append-only history (world-cup-specials-history.json, v1) so the
 * tracker can show current + past slates without re-deriving from an overwritten file.
 *
 * Honest by construction: it archives a COMPACT snapshot of the real cards as they were (id, odds,
 * result, per-leg settlement status) — it never fabricates outcomes or backfills days that have no data.
 * Idempotent: re-running for the same date REPLACES that day's entry (no duplicates).
 *
 * Usage:
 *   node app/scripts/archive-world-cup-specials.mjs                 # archive the current snapshot
 *   node app/scripts/archive-world-cup-specials.mjs --file <path>   # archive a specific snapshot (e.g. a git-recovered day)
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const root = path.join(process.cwd(), "app", "public", "data", "world-cup");
const SRC = val("--file", path.join(root, "world-cup-specials.json"));
const HISTORY = path.join(root, "world-cup-specials-history.json");

function compactLeg(l) {
  if (typeof l === "string") return { selection: l, settlementStatus: "pending", fixture: null };
  const settlement = l.settlement?.result ?? l.settlementStatus ?? "pending";
  const selection = l.displaySelection || [l.participant, l.marketLabel, l.side, l.line].filter((x) => x != null && x !== "").join(" ") || l.legId || "leg";
  return { selection: String(selection).slice(0, 120), settlementStatus: settlement, fixture: l.fixture ?? null };
}

function cardResult(card, legs) {
  if (card.result) return card.result;
  const rs = legs.map((l) => l.settlementStatus);
  if (rs.some((r) => r === "lost" || r === "miss")) return "lost";
  if (rs.length && rs.every((r) => r === "won" || r === "hit" || r === "void")) return "won";
  return null; // pending / candidate
}

function compactDay(snapshot) {
  const cards = (snapshot.cards ?? []).map((c) => {
    const legs = (c.legs ?? []).map(compactLeg);
    return {
      id: c.id ?? c.cardId ?? null,
      title: c.title ?? c.label ?? "World Cup Special",
      combinedOdds: c.combinedOdds ?? null,
      projectedReturn: c.projectedReturn ?? null,
      result: cardResult(c, legs),
      legCount: legs.length,
      legs,
    };
  });
  return { date: snapshot.date, generatedAt: snapshot.generatedAt ?? null, cardCount: cards.length, cards };
}

let snapshot;
try { snapshot = JSON.parse(fs.readFileSync(SRC, "utf8")); } catch { console.error(`[archive-specials] cannot read ${SRC}`); process.exit(1); }
if (!snapshot.date) { console.error("[archive-specials] snapshot has no date — refusing to archive"); process.exit(1); }

let history;
try { history = JSON.parse(fs.readFileSync(HISTORY, "utf8")); } catch { history = { version: "world-cup-specials-history-v1", days: [] }; }
if (!Array.isArray(history.days)) history.days = [];

const day = compactDay(snapshot);
history.days = history.days.filter((d) => d.date !== day.date); // replace same date (idempotent)
history.days.push(day);
history.days.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // newest first
history.updatedAt = snapshot.generatedAt ?? history.updatedAt ?? null;

fs.writeFileSync(HISTORY, JSON.stringify(history, null, 2) + "\n");
console.log(`[archive-specials] archived ${day.date} (${day.cardCount} cards) → ${history.days.length} day(s) in history`);
