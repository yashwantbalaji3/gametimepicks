#!/usr/bin/env node
/**
 * FIGHTER TALE OF THE TAPE — height, reach, stance and date of birth, for every fighter on the
 * captured schedule.
 *
 * ── The free-source sweep, and the one route it did NOT take ────────────────────────────────────
 * The fight model is built entirely from OUTCOME history — win rate, finish rate, durability,
 * method tendencies. All three heads clear their bars on that, but the corpus we ingested is only
 * two of `scrape_ufc_stats`' files (events, results), so the physical attributes every matchmaker
 * reasons about were never available to it. Reach and stance are the first two things said about a
 * fight; the model had neither.
 *
 * The obvious source is ufcstats.com, which serves the canonical tale-of-the-tape. It is behind a
 * JavaScript bot-detection interstitial — a scrape returns the challenge page, not the table. That
 * is a deliberate access control and this repository does not work around one, so that route is
 * closed rather than defeated.
 *
 * ESPN's core API carries the same fields on a public JSON endpoint we ALREADY use for the schedule
 * and results, with no key and no challenge. Same data, a source we are plainly allowed to read.
 *
 * ── Honest about what this is ───────────────────────────────────────────────────────────────────
 * Tale-of-the-tape is SELF-REPORTED and static. Listed heights are famously generous and reach is
 * measured inconsistently. It is a weak prior, not a measurement — fetching it is not the same as
 * improving a model, and only the evaluation that follows decides whether it earns a place.
 *
 *   node app/scripts/ufc/fetch-ufc-fighter-tott.mjs --now <ISO> [--spacing-ms 150]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCHEDULE = path.join(APP, "public", "data", "ufc", "schedule", "latest.json");
const OUT = path.resolve(APP, "..", "data", "internal", "research", "ufc", "raw", "stats");
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const SPACING = Number(arg("--spacing-ms", "150"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Every competitor id on the captured forward schedule, with the name the schedule knows them by. */
const schedule = JSON.parse(fs.readFileSync(SCHEDULE, "utf8"));
const wanted = new Map();
for (const b of schedule.bouts ?? []) {
  for (const side of ["red", "blue"]) {
    // The capture stores the competitor id as `redProviderId` / `blueProviderId`.
    const id = b[`${side}ProviderId`];
    const name = b[side];
    if (id && name) wanted.set(String(id), name);
  }
}
if (wanted.size === 0) { console.log("no athlete ids on the captured schedule — nothing to fetch"); process.exit(0); }

const prior = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(OUT, "ufc_fighter_tott.json"), "utf8")).fighters ?? []; }
  catch { return []; }
})();
const byId = new Map(prior.map((f) => [String(f.athleteId), f]));

let fetched = 0, failed = 0;
for (const [id, name] of wanted) {
  // Physicals do not change. A fighter already on file is skipped, so repeat runs are nearly free.
  if (byId.has(id) && byId.get(id).reachIn != null) continue;
  try {
    const res = await fetch(`https://sports.core.api.espn.com/v2/sports/mma/athletes/${id}`, {
      headers: { "user-agent": "gametimepicks-research/1.0" },
    });
    if (!res.ok) { failed++; await sleep(SPACING); continue; }
    const a = await res.json();
    byId.set(id, {
      athleteId: id,
      name: a.displayName ?? name,
      heightIn: Number.isFinite(a.height) ? a.height : null,
      weightLb: Number.isFinite(a.weight) ? a.weight : null,
      reachIn: Number.isFinite(a.reach) ? a.reach : null,
      stance: a.stance?.text ?? null,
      dateOfBirth: a.dateOfBirth ? String(a.dateOfBirth).slice(0, 10) : null,
    });
    fetched++;
  } catch { failed++; }
  await sleep(SPACING);
}

const fighters = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "ufc_fighter_tott.json"), JSON.stringify({
  schemaVersion: 1,
  artifact: "ufc-fighter-tale-of-the-tape",
  dataClass: "RESEARCH_RAW",
  generatedAt: NOW,
  source: {
    id: "espn_core_mma",
    name: "ESPN core MMA athlete endpoint",
    url: "https://sports.core.api.espn.com/v2/sports/mma/athletes/<id>",
    license: "public JSON endpoint, no key",
    note: "ufcstats.com carries the same fields but is behind JavaScript bot-detection; that route was not taken.",
  },
  caveat: "Self-reported and static. Listed heights are generous and reach is measured inconsistently — a weak prior, not a measurement.",
  fighters,
}, null, 1) + "\n");

const withReach = fighters.filter((f) => f.reachIn != null).length;
const withStance = fighters.filter((f) => f.stance).length;
console.log(`${fighters.length} fighters on file (+${fetched} new, ${failed} unavailable)`);
console.log(`  reach on ${withReach} · stance on ${withStance} · dob on ${fighters.filter((f) => f.dateOfBirth).length}`);
