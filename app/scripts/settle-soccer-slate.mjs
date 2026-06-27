/**
 * settle-soccer-slate.mjs — the unified soccer settlement RUNNER. It loads every pending soccer product
 * for a slate (Mr. Dub daily-portfolio lanes + World Cup Specials + WC parlay cards), normalizes each leg,
 * and either:
 *   • grades them through the shared engine when an official-results file is supplied (--official <path>),
 *     printing a full settlement report, OR
 *   • prints the inventory + emits the exact official-scores TEMPLATE (the matches + players that need
 *     official data) when no results are supplied — so the operator knows precisely what to provide.
 *
 * It is READ-ONLY: it never writes settled-history, ledgers, or bankroll files, and it NEVER fabricates a
 * score. Persisting settled results is a separate, explicitly operator-approved step.
 *
 *   node scripts/settle-soccer-slate.mjs --date 2026-06-23                          # inventory + template
 *   node scripts/settle-soccer-slate.mjs --date 2026-06-23 --official scores.json   # graded report
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
// Default to TODAY (ET), never a hardcoded past date (the live path always passes --date).
const DATE = getArg("date", new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }));
const OFFICIAL = getArg("official", null);
const DATA = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app", "public", "data");
const read = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8")); } catch { return null; } };

/** Parse a leg id like "player:48:player_shots_on_target:Jhon Cordoba" or "team:47:moneyline_90:away". */
function parseLeg(l) {
  const id = String(l.id ?? "");
  const parts = id.split(":");
  const kind = parts[0];                    // team | player
  const matchId = Number(parts[1]);
  const market = parts[2] ?? "";
  const tail = parts.slice(3).join(":");    // "away" | "no" | "under" | player name
  const sel = String(l.selection ?? "");
  let side = null;
  if (kind === "team") {
    if (market === "moneyline_90") side = tail;                       // home | away
    else if (market === "match_total_goals") side = /under/i.test(sel) ? "under" : "over";
    else if (market === "btts") side = /:\s*no|\bno\b/i.test(sel) ? "no" : "yes";
  } else if (market === "player_assists" || market === "player_shots_on_target") {
    side = "over";
  }
  const pointMatch = sel.match(/(\d+(?:\.\d+)?)/);
  return {
    id, matchId, market, selection: sel, player: l.player ?? (kind === "player" ? tail : null),
    side, point: pointMatch ? Number(pointMatch[1]) : null, oddsAmerican: Number(l.odds ?? 0), matchup: l.matchup ?? null,
  };
}

const normT = (s) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
/** Parse a World Cup Specials / parlay leg (schema: kind/eventId/market/participant/side/line/odds). */
function parseSpecialLeg(l) {
  const market = String(l.market ?? "");
  const fixture = String(l.fixture ?? "");
  const [home] = fixture.split(/\s+vs\s+/i);
  let side = null, player = null;
  if (l.kind === "team") {
    if (market === "moneyline_90") side = normT(l.participant) === normT(home) ? "home" : "away";
    else if (market === "match_total_goals") side = /under/i.test(String(l.side ?? l.participant)) ? "under" : "over";
    else if (market === "btts") side = /no/i.test(String(l.side ?? l.participant)) ? "no" : "yes";
  } else {
    player = l.participant ?? l.player ?? null;
    if (market === "player_assists" || market === "player_shots_on_target") side = "over";
  }
  return { id: l.legId ?? l.id ?? "", matchId: Number(l.eventId), market, selection: `${l.participant ?? ""}${l.side ? " " + l.side : ""}`.trim(),
    side, player, point: typeof l.line === "number" ? l.line : null, oddsAmerican: Number(l.odds ?? 0), matchup: fixture };
}

function collectProducts() {
  const cards = []; // { product, label, stake, legs[] }
  const dp = read(`mr-dub/daily-portfolio.json`);
  if (dp && (dp.date === DATE)) {
    for (const lane of dp.lanes ?? []) {
      cards.push({ product: lane.stake >= 100 ? "bank-builder" : "moonshot", label: `${lane.lane === "A" ? "Lane A" : "Lane B"} (stake $${lane.stake})`, stake: Number(lane.stake ?? 0), legs: (lane.legs ?? []).map(parseLeg) });
    }
  }
  const sp = read(`world-cup/world-cup-specials.json`);
  if (sp && sp.date === DATE) {
    for (const c of sp.cards ?? []) cards.push({ product: "wc-specials", label: c.title ?? "WC Special", stake: Number(c.stakePreview ?? c.stake ?? 0), legs: (c.legs ?? []).map(parseSpecialLeg), paper: true });
  }
  const pl = read(`world-cup/parlays/${DATE}.json`);
  if (pl) for (const c of pl.cards ?? []) cards.push({ product: "wc-parlay", label: c.title ?? c.name ?? "WC Parlay", stake: Number(c.stakePreview ?? c.stake ?? 0), legs: (c.legs ?? []).map(parseSpecialLeg), paper: true });
  return cards;
}

function main() {
  const cards = collectProducts();
  const allLegs = cards.flatMap((c) => c.legs);
  const matches = new Map(), players = new Map();
  for (const l of allLegs) {
    if (l.matchId) matches.set(l.matchId, l.matchup || `match ${l.matchId}`);
    if (l.player) players.set(`${l.player}|${l.matchId}`, { player: l.player, matchId: l.matchId });
  }

  console.log(`\n=== Soccer settlement runner · slate ${DATE} ===`);
  console.log(`Products: ${cards.length} card(s) · ${allLegs.length} leg(s) · ${matches.size} match(es) · ${players.size} player line(s) needed\n`);
  for (const c of cards) {
    console.log(`• [${c.product}] ${c.label} — ${c.legs.length} legs @ stake $${c.stake}`);
    for (const l of c.legs) console.log(`    - ${l.matchup ?? "?"} · ${l.market} · ${l.selection} (${l.oddsAmerican > 0 ? "+" : ""}${l.oddsAmerican})`);
  }

  if (!OFFICIAL) {
    // Emit the official-scores TEMPLATE — blanks the operator/automation fills with real data. NEVER filled here.
    const template = {
      generatedAt: `${DATE}T00:00:00Z`, date: DATE, source: "FILL: API-Football /fixtures or ESPN official FT scores (operator-verified)",
      matches: [...matches.entries()].map(([matchId, match]) => ({ matchId, match, homeGoals: null, awayGoals: null, status: "FILL: FT" })),
      players: [...players.values()].map((p) => ({ player: p.player, matchId: p.matchId, goals: null, assists: null, shotsOnTarget: null, minutes: null })),
    };
    console.log(`\n--- BLOCKED: no official results supplied. Provide --official <file> matching this template: ---`);
    console.log(JSON.stringify(template, null, 1));
    console.log(`\nNo grading performed. No file written. (Fabricating scores is prohibited.)`);
    return;
  }

  // Grade against supplied official results (dynamic import keeps the engine the single source of truth).
  import("../src/lib/settlement/soccer-markets.ts").then(({ settleCard }) => {
    const official = JSON.parse(fs.readFileSync(OFFICIAL, "utf8"));
    console.log(`\n--- GRADED against ${OFFICIAL} (source: ${official.source}) ---`);
    for (const c of cards) {
      const s = settleCard(c.legs, c.stake, official);
      console.log(`\n• [${c.product}] ${c.label} → ${s.result.toUpperCase()}  (stake $${c.stake} → payout $${s.payout}, P/L $${s.paperPnl})`);
      for (const g of s.legs) console.log(`    ${g.result === "won" ? "✓" : g.result === "lost" ? "✗" : g.result === "void" ? "∅" : "…"} ${g.reason}`);
    }
    console.log(`\nRead-only report. To persist: re-run the operator-approved settlement-write step.`);
  });
}
main();
