/**
 * THE NFL RISK LADDER — one card per price band, from real posted prices and nothing else
 * (Program 201 · Release B).
 *
 * ── WHY THIS SELECTS ON PRICE AND NOT ON THE MODEL ──────────────────────────────────────────────
 * EPL's ladder header settles this question for any sport whose model has passed nothing: the side
 * is THE MARKET'S OWN FAVOURITE at its posted consensus price, never a model read. NFL's case is
 * even sharper — its preseason team-strength models were REJECTED three times on preregistered
 * bars (P178/P181), the team signal was found not significant, and the regular-season evaluation
 * bars are frozen but unsampled until the season starts. A ladder selecting on that model would be
 * publishing exactly the read the significance gate exists to stop.
 *
 * ── SETTLEABLE BY CONSTRUCTION ──────────────────────────────────────────────────────────────────
 * Every leg is `moneyline` or `total_points`, which gradeNflLeg settles from the official final
 * score capture (ftHome/ftAway, joined on canonicalEventId). A card that could not be graded never
 * enters the record, so it must not be published either — this builder exists only because the
 * grader now does.
 *
 * Same discipline as the EPL ladder, via the SAME shared engine (band-assembly.mjs): one leg per
 * event, bands named by the canonical bucket function and never widened, slate day walked forward
 * to the first day with two upcoming priced events.
 *
 * Writes public/data/parlays/risk-ladder-nfl/<date>.json (+ latest.json), in the shape the
 * settler, tier grid and coverage matrix already consume.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { INDIVIDUAL_LEG_ODDS_GUARDS } from "../../src/lib/parlays/risk-odds-bands.mjs";
import { assembleBands } from "../../src/lib/parlays/band-assembly.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(APP, "public", "data", "parlays", "risk-ladder-nfl");
const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const NOW = arg("--now", new Date().toISOString());
const etDay = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const odds = readJson(arg("--odds", null) ?? path.join(APP, "public", "data", "nfl", "markets", "latest.json"));

/* Slate day: first day with two upcoming priced events (two is the shortest card any band takes);
   else the earliest upcoming day so the honest empty state stays reachable. Same rule as EPL. */
const nowMs = Date.parse(NOW);
const upcoming = (odds?.rows ?? [])
  .filter((r) => { const t = Date.parse(r.kickoffUtc ?? ""); return Number.isFinite(t) && t > nowMs; })
  .sort((a, b) => Date.parse(a.kickoffUtc) - Date.parse(b.kickoffUtc));
const byDay = new Map();
for (const r of upcoming) { const d = etDay(r.kickoffUtc); byDay.set(d, (byDay.get(d) ?? 0) + 1); }
const servable = [...byDay.entries()].find(([, n]) => n >= 2)?.[0];
const DATE = arg("--date", servable ?? (upcoming[0] ? etDay(upcoming[0].kickoffUtc) : etDay(NOW)));

const write = (payload) => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${DATE}.json`), JSON.stringify(payload, null, 1) + "\n");
  fs.writeFileSync(path.join(OUT, "latest.json"), JSON.stringify(payload, null, 1) + "\n");
};
const base = { schemaVersion: 1, artifact: "nfl-risk-ladder", dataClass: "PUBLIC_DERIVED", moneyClass: "NON_MONEY", sport: "nfl", date: DATE, generatedAt: NOW };

if (!odds?.rows?.length) {
  write({ ...base, state: "NO_PRICES", reason: "no NFL price capture is available to build from", cards: [], skipped: [] });
  console.log("nfl ladder: no prices"); process.exit(0);
}
if (upcoming.length === 0) {
  write({ ...base, state: "NOT_PLAYING_TODAY", reason: `every priced event in the capture (${odds.capturedAt ?? "unknown time"}) has kicked off — the next capture serves the next slate`, cards: [], skipped: [] });
  console.log("nfl ladder: no upcoming priced events"); process.exit(0);
}

const eligible = upcoming.filter((r) => etDay(r.kickoffUtc) === DATE);

const decOf = (am) => (am > 0 ? 1 + am / 100 : 1 + 100 / Math.abs(am));
const inGuard = (am) => am >= INDIVIDUAL_LEG_ODDS_GUARDS.minFavoriteAmerican && am <= INDIVIDUAL_LEG_ODDS_GUARDS.maxUnderdogAmerican;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };

/*
 * ── CANDIDATES PER EVENT — consensus across the captured books, one leg per event ──────────────
 * The NFL capture stores per-book prices; a leg quotes the MEDIAN across books for its side, with
 * the contributing books carried for lineage (the qualified-leg contract's sourceLineage). The
 * favourite is the shorter median moneyline side; totals contribute both sides at each posted
 * line. None of these is a model read.
 */
function candidatesFor(r) {
  const out = [];
  const matchup = `${r.away?.abbr ?? r.away?.name ?? "?"} @ ${r.home?.abbr ?? r.home?.name ?? "?"}`;
  const base = { sport: "nfl", eventId: r.canonicalEventId, player: null, matchup, kickoffUtc: r.kickoffUtc };
  const books = r.books ?? [];

  for (const side of ["home", "away"]) {
    const prices = books.map((b) => b?.moneyline?.[side]).filter((v) => Number.isFinite(v));
    const am = median(prices);
    if (am == null || !inGuard(am)) continue;
    const team = side === "home" ? (r.home?.name ?? r.home?.abbr) : (r.away?.name ?? r.away?.abbr);
    out.push({ ...base, team, market: "moneyline", marketLabel: "Moneyline", side, line: null,
      odds: am, decimal: decOf(am), books: books.filter((b) => Number.isFinite(b?.moneyline?.[side])).map((b) => b.book) });
  }
  const byLine = new Map();
  for (const b of books) {
    const t = b?.total;
    if (typeof t?.line !== "number") continue;
    for (const side of ["over", "under"]) {
      const am = t.prices?.[side];
      if (!Number.isFinite(am)) continue;
      const key = `${t.line}:${side}`;
      if (!byLine.has(key)) byLine.set(key, { line: t.line, side, prices: [], books: [] });
      byLine.get(key).prices.push(am);
      byLine.get(key).books.push(b.book);
    }
  }
  for (const { line, side, prices, books: bk } of byLine.values()) {
    const am = median(prices);
    if (am == null || !inGuard(am)) continue;
    out.push({ ...base, team: null, market: "total_points", marketLabel: `Total points ${line}`,
      side, line, odds: am, decimal: decOf(am), books: bk });
  }
  return out.sort((a, z) => a.decimal - z.decimal);   // shortest first
}

const byFixture = [];
const rejected = [];
for (const r of eligible) {
  const c = candidatesFor(r);
  if (c.length === 0) { rejected.push({ eventId: r.canonicalEventId, reason: "no priced leg inside the canonical guard" }); continue; }
  byFixture.push({ eventId: r.canonicalEventId, kickoffIso: r.kickoffUtc, candidates: c });
}
/* Shortest-priced event first — the market's own ordering, the only one that can reach `low`. */
byFixture.sort((a, b) => a.candidates[0].decimal - b.candidates[0].decimal
  || Date.parse(a.kickoffIso) - Date.parse(b.kickoffIso));

const { cards: assembled, skipped } = assembleBands(byFixture);
const cards = assembled.map((c) => ({
  tier: c.tier, slipId: `nfl-${c.tier}-${DATE}`,
  combinedAmerican: c.american, combinedDecimal: c.decimal,
  legs: c.legs,
  status: "pending",
  /* Null, never 0-0: this stream has settled nothing. */
  tierRecord: null,
}));

write({
  ...base, state: "PUBLISHED",
  pricedEvents: eligible.length, eligibleLegs: byFixture.length, rejectedLegs: rejected,
  cards, skipped,
  selection: "a consensus market price on a settleable market — the moneyline favourite, or a total at the books' own line. Never this model's read: NFL team-strength models were rejected on preregistered bars and the regular-season bars are frozen but unsampled",
  note: "Prices are real, posted, and quoted at the median across captured books; the side is THE MARKET'S OWN, " +
        "never this model's read. Every leg settles from the official final score. Paper-only, educational.",
});
console.log(`nfl ladder ${DATE}: ${eligible.length} priced events · ${byFixture.length} eligible legs -> ${cards.length}/4 bands carded${skipped.length ? ` (skipped ${skipped.map((s) => s.tier).join(", ")})` : ""}`);
const legDesc = (l) => l.market === "total_points" ? `${l.matchup} ${l.side} ${l.line}` : (l.team ?? l.matchup);
for (const c of cards) console.log(`  ${c.tier.padEnd(9)} ${c.combinedAmerican > 0 ? "+" : ""}${c.combinedAmerican} · ${c.legs.length} legs · ${c.legs.map(legDesc).join(" + ")}`);
for (const s of skipped) console.log(`  ${s.tier.padEnd(9)} SKIPPED — ${s.reason}`);
