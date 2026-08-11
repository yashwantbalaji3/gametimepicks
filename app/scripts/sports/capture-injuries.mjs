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

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = (sport) => path.join(APP, "..", "data", "internal", "research", "injuries", sport);

const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

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
  const artifact = {
    schemaVersion: 1,
    sport,
    dataClass: "PRIVATE_RESEARCH",
    generatedAt: NOW,
    sourceAsOf: feed.timestamp ?? NOW,
    source: { id: "espn_scoreboard", name: `ESPN ${sport.toUpperCase()} public injuries feed`, license: "public JSON endpoint, no key; normalized facts only — editorial prose never stored" },
    contractVersion: normalized.contractVersion,
    reconciliation: normalized.reconciliation,
    quarantined: normalized.quarantined,
    entries: normalized.entries,
  };
  fs.mkdirSync(OUT(sport), { recursive: true });
  fs.writeFileSync(path.join(OUT(sport), "latest.json"), JSON.stringify(artifact, null, 1));
  console.log(`${sport} injuries/latest.json: ${normalized.entries.length} entries, ${normalized.quarantined.length} quarantined, exact=${normalized.reconciliation.exact}`);
}
