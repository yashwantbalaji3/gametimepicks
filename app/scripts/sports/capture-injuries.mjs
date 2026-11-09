/**
 * NFL + NBA injuries capture — ESPN public injuries feed → normalized FACTS through the contract
 * (Program 162 · Release H). Registered source class: espn public JSON (same as espn_scoreboard).
 *
 * WHAT IS STORED: the contract's normalized entries ONLY — sport, team id, athlete id, display
 * name, status, statedAt. The feed's editorial prose (short/long comments) is NEVER stored: this
 * repository republishes facts, not ESPN's writing. A guard test greps the artifact for the
 * prose fields.
 *
 * PRIVATE data class: written under data/internal/research/injuries/ (shadow-model inputs), never
 * under app/public. A fetch/parse failure writes NOTHING and exits 0 with SOURCE_STALE on stdout —
 * last-known-good stands.
 *
 * Run: node scripts/sports/capture-injuries.mjs --now <ISO>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeInjuryFeed } from "../../src/lib/sports/injuries/contract.mjs";
import { ABSENT_DESIGNATION_CARRY_H, carryForwardDesignations } from "../../src/lib/sports/injuries/carry-forward.mjs";
import { parseActivations } from "../../src/lib/availability/transactions.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = (sport) => path.join(APP, "..", "data", "internal", "research", "injuries", sport);
const ROSTER = (sport) => (sport === "nfl" ? path.join(APP, "public", "data", "nfl", "rosters", "latest.json") : path.join(APP, "..", "data", "internal", "research", "nba", "rosters", "latest.json"));

const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

/* Founder decision 4 (2026-11-09): verified transactions (activated / reinstated, dated) end recovered IR and suspension
   designations. ESPN's transactions feed, paged; only the parsed FACTS are stored (athlete id, team id, kind, date) —
   never the feed's sentences. A failed fetch stores nothing and ends nothing (the designations stay in force). */
const TRANSACTIONS = {
  nfl: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/transactions",
  nba: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/transactions",
};
const TX_OUT = (sport) => path.join(APP, "..", "data", "internal", "research", "transactions", sport);
async function fetchTransactions(sport) {
  const all = [];
  for (let page = 1; page <= 30; page += 1) {
    const res = await fetch(`${TRANSACTIONS[sport]}?limit=100&page=${page}`);
    const doc = JSON.parse(await res.text());
    if (!Array.isArray(doc.transactions)) throw new Error("no transactions array");
    all.push(...doc.transactions);
    if (!doc.pageCount || page >= doc.pageCount || !doc.transactions.length) break;
  }
  return { transactions: all };
}

const FEEDS = {
  nfl: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries",
  nba: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries",
};

for (const [sport, url] of Object.entries(FEEDS)) {
  let feed = null;
  try {
    const res = await fetch(url);
    feed = JSON.parse(await res.text());
    if (!Array.isArray(feed.injuries)) throw new Error("no injuries array");
  } catch (err) {
    console.log(`SOURCE_STALE: ${sport} injuries feed unavailable (${String(err?.message ?? err).slice(0, 80)}) — last-known-good stands, nothing written`);
    continue;
  }
  const normalized = normalizeInjuryFeed(feed, { sport, nowIso: NOW });
  /*
   * AN OMISSION IS NOT AN ACTIVATION (P254d — see lib/sports/injuries/carry-forward.mjs).
   *
   * ESPN's feed is a rolling list: long-term designations age out of it without any "activated"
   * event, and every consumer used to read the absence as health. The file this capture is about to
   * replace is the only memory there is, so it is read FIRST. The feed still overrules it whenever
   * it lists the player at all.
   */
  let previous = null;
  try { previous = JSON.parse(fs.readFileSync(path.join(OUT(sport), "latest.json"), "utf8")); } catch { previous = null; }
  /* R1 (eligibility contract v1): a carried long-term designation ends only on an explicit activation — the feed listing
     the player, or the roster capture (taken before this step in every workflow) saying "active" after the designation. */
  let roster = null;
  try { roster = JSON.parse(fs.readFileSync(ROSTER(sport), "utf8")); } catch { roster = null; }
  let activations = [];
  try {
    const parsed = parseActivations(await fetchTransactions(sport), roster, { sport });
    activations = parsed.activations;
    fs.mkdirSync(TX_OUT(sport), { recursive: true });
    fs.writeFileSync(path.join(TX_OUT(sport), "latest.json"), JSON.stringify({ schema: parsed.schema, sport, dataClass: "PRIVATE_RESEARCH", capturedAt: NOW, source: `ESPN ${sport.toUpperCase()} public transactions feed — parsed facts only`, rosterAsOf: roster?.generatedAt ?? roster?.capturedAt ?? null, activations, unmatched: parsed.unmatched.map((u) => ({ name: u.name, teamId: u.teamId, kind: u.kind, date: u.date, reason: u.reason })) }, null, 1));
    console.log(`${sport} transactions: ${activations.length} verified activations, ${parsed.unmatched.length} unmatched (never used)`);
  } catch (err) {
    console.log(`SOURCE_STALE: ${sport} transactions feed unavailable (${String(err?.message ?? err).slice(0, 80)}) — no activation applied this capture`);
  }
  const carry = carryForwardDesignations({ previousEntries: previous?.entries ?? [], currentEntries: normalized.entries, nowIso: NOW, roster, activations });
  const artifact = {
    schemaVersion: 1,
    sport,
    dataClass: "PRIVATE_RESEARCH",
    generatedAt: NOW,
    sourceAsOf: feed.timestamp ?? NOW,
    source: { id: "espn_scoreboard", name: `ESPN ${sport.toUpperCase()} public injuries feed`, license: "public JSON endpoint, no key; normalized facts only — editorial prose never stored" },
    contractVersion: normalized.contractVersion,
    reconciliation: normalized.reconciliation,
    /* `reconciliation` still describes the FEED exactly. Carried rows are accounted beside it, so
       entries.length === reconciliation.kept + carryForward.carried holds — and is guarded. */
    carryForward: {
      carried: carry.carried.length,
      windowHours: ABSENT_DESIGNATION_CARRY_H,
      previousGeneratedAt: previous?.generatedAt ?? null,
      skipped: carry.skipped,
    },
    quarantined: normalized.quarantined,
    entries: carry.entries,
  };
  fs.mkdirSync(OUT(sport), { recursive: true });
  fs.writeFileSync(path.join(OUT(sport), "latest.json"), JSON.stringify(artifact, null, 1));
  console.log(`${sport} injuries/latest.json: ${normalized.entries.length} entries from the feed + ${carry.carried.length} carried forward, ${normalized.quarantined.length} quarantined, exact=${normalized.reconciliation.exact}`);
}
