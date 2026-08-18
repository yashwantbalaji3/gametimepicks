#!/usr/bin/env node
/**
 * PHYSICALS FOR THE HISTORICAL CORPUS — so the tale-of-the-tape features can actually be evaluated.
 *
 * ── Why this is separate from the forward-schedule fetch ────────────────────────────────────────
 * That one covers the 163 fighters on the next cards, which is what a PAGE needs. A refit needs the
 * corpus: 2,738 distinct fighters across 8,847 fights. With only the forward set, exactly 67 fights
 * (0.8%) had physicals on both sides — you cannot fit a model on 67 fights, let alone judge it
 * against bars set on 3,557.
 *
 * ── The join, and why it needs two calls ────────────────────────────────────────────────────────
 * The fight corpus identifies fighters by NAME; the athlete endpoint takes an ID. ESPN's athlete
 * index is 38,054 `$ref` URLs with no names attached, so resolving names from it would mean
 * fetching all of them. Search resolves one name in one call instead, and the `uid` carries the id.
 *
 * RESUMABLE by design: every fighter already on file is skipped, so an interrupted run loses
 * nothing and a repeat run is nearly free. Names that resolve to no MMA athlete are recorded as
 * misses rather than retried forever.
 *
 *   node app/scripts/ufc/fetch-ufc-corpus-physicals.mjs --now <ISO> [--limit 400] [--spacing-ms 120]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RAW = path.resolve(APP, "..", "data", "internal", "research", "ufc", "raw", "stats");
const OUT = path.join(RAW, "ufc_fighter_tott.json");
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const LIMIT = Number(arg("--limit", "99999"));
const SPACING = Number(arg("--spacing-ms", "120"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/** Every distinct fighter named in the results corpus. */
const csv = fs.readFileSync(path.join(RAW, "ufc_fight_results.csv"), "utf8").split(/\r?\n/);
const header = csv[0].split(",");
const boutIdx = header.indexOf("BOUT");
const wanted = new Map();                                  // normalised -> display name
for (const line of csv.slice(1)) {
  // BOUT is quoted and may contain commas; take the field by a tolerant split on quotes.
  const m = /"([^"]*vs\.[^"]*)"/.exec(line) ?? (boutIdx >= 0 ? [null, line.split(",")[boutIdx]] : null);
  const bout = m?.[1];
  if (!bout) continue;
  for (const side of bout.split(" vs. ")) {
    const n = norm(side);
    if (n && !wanted.has(n)) wanted.set(n, side.trim());
  }
}

const doc = (() => { try { return JSON.parse(fs.readFileSync(OUT, "utf8")); } catch { return null; } })();
const fighters = new Map((doc?.fighters ?? []).map((f) => [norm(f.name), f]));
const misses = new Set(doc?.unresolved ?? []);

const todo = [...wanted].filter(([n]) => !fighters.has(n) && !misses.has(n)).slice(0, LIMIT);
console.log(`corpus fighters ${wanted.size} · on file ${fighters.size} · known misses ${misses.size} · fetching ${todo.length}`);

let got = 0, missed = 0;
const flush = () => {
  fs.writeFileSync(OUT, JSON.stringify({
    schemaVersion: 1,
    artifact: "ufc-fighter-tale-of-the-tape",
    dataClass: "RESEARCH_RAW",
    generatedAt: NOW,
    source: {
      id: "espn_core_mma",
      name: "ESPN search v2 (name → athlete id) + core MMA athlete endpoint (physicals)",
      license: "public JSON endpoints, no key",
      note: "ufcstats.com carries the same fields but is behind JavaScript bot-detection; that route was not taken.",
    },
    caveat: "Self-reported and static. Listed heights are generous and reach is measured inconsistently — a weak prior, not a measurement.",
    fighters: [...fighters.values()].sort((a, b) => a.name.localeCompare(b.name)),
    unresolved: [...misses].sort(),
  }, null, 1) + "\n");
};

for (const [n, display] of todo) {
  let id = null;
  try {
    const r = await fetch(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(display)}&limit=6`,
      { headers: { "user-agent": "gametimepicks-research/1.0" } });
    if (r.ok) {
      const d = await r.json();
      const players = (d.results ?? []).find((g) => g.type === "player")?.contents ?? [];
      // Take the first MMA hit whose name matches after folding — never the first hit outright,
      // which is often a different sport's player with a similar name.
      const hit = players.find((p) => /mma/i.test(p.description ?? "") && norm(p.displayName) === n)
        ?? players.find((p) => /mma/i.test(p.description ?? ""));
      const uid = hit?.uid ?? "";
      id = /a:(\d+)/.exec(uid)?.[1] ?? null;
    }
  } catch { /* transient — left for the next run */ }
  await sleep(SPACING);

  if (!id) { misses.add(n); missed++; if (missed % 25 === 0) flush(); continue; }

  try {
    const r2 = await fetch(`https://sports.core.api.espn.com/v2/sports/mma/athletes/${id}`,
      { headers: { "user-agent": "gametimepicks-research/1.0" } });
    if (r2.ok) {
      const a = await r2.json();
      fighters.set(n, {
        athleteId: String(id),
        name: a.displayName ?? display,
        heightIn: Number.isFinite(a.height) ? a.height : null,
        weightLb: Number.isFinite(a.weight) ? a.weight : null,
        reachIn: Number.isFinite(a.reach) ? a.reach : null,
        stance: a.stance?.text ?? null,
        dateOfBirth: a.dateOfBirth ? String(a.dateOfBirth).slice(0, 10) : null,
      });
      got++;
    } else misses.add(n);
  } catch { /* transient */ }
  await sleep(SPACING);
  if (got % 25 === 0) { flush(); process.stdout.write(`  +${got} resolved, ${missed} unresolved\r`); }
}

flush();
const withReach = [...fighters.values()].filter((f) => f.reachIn != null).length;
console.log(`\non file ${fighters.size} fighters (+${got} this run) · unresolved ${misses.size} · reach on ${withReach}`);
