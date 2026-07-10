/**
 * build-market-coverage-matrix.mjs — the honest, INTERNAL map of what GameTime can actually do per
 * sport × market: generate a pick, settle a paper card, use it in a product — with the data + settlement
 * source, what's missing, and the unlock plan. Nothing here lets an unavailable market fabricate a pick;
 * the whole point is to show breadth WITHOUT overclaiming.
 *
 * Settleability for MLB + Soccer is derived from the real code (candidate-leg / mlb-markets) so the matrix
 * can't drift from reality; UFC / NBA / NFL are honestly `provider_needed` / `coming_soon`.
 *
 * Output: data/internal/market-readiness/coverage-matrix.json (public:false, not web-served).
 * Usage: npx tsx scripts/build-market-coverage-matrix.mjs [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { settlementSourceFor } from "../src/lib/multi-sport/candidate-leg.ts";

const APP = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const REPO = path.join(APP, "..");
const OUT_DIR = path.join(REPO, "data", "internal", "market-readiness");
const WRITE = process.argv.includes("--write");

/** One row; settlement/generate flags are derived from the real settlement wiring where possible. */
const row = (sport, market, { data, generate, product, missing = [], unlock, copy, statusOverride }) => {
  const settlementSource = sport === "MLB" || sport === "Soccer" ? settlementSourceFor(sport, market) : "none";
  const canSettlePaper = settlementSource !== "none";
  const status = statusOverride ?? (generate && canSettlePaper && product ? "available"
    : generate && canSettlePaper ? "settlement_supported_data_needed"
    : generate ? "data_available_settlement_needed"
    : "provider_needed");
  return { sport, market, status, canGeneratePick: !!generate, canSettlePaper, canUseInProduct: !!product, dataSource: data, settlementSource, missing, unlockPlan: unlock, userCopy: copy };
};

const ROWS = [
  // ── MLB ──
  row("MLB", "moneyline", { data: "Odds API (committed team markets)", generate: true, product: true, unlock: "live", copy: "Model + market read on who wins." }),
  row("MLB", "run_line", { data: "Odds API", generate: true, product: true, unlock: "live", copy: "The −1.5 / +1.5 spread." }),
  row("MLB", "total", { data: "Odds API", generate: true, product: true, unlock: "live", copy: "Over/under on combined runs." }),
  row("MLB", "batter_hits", { data: "board projections + settled_leans", generate: true, product: true, unlock: "live (most reliable prop)", copy: "Hits over/under — our most reliable prop market." }),
  row("MLB", "batter_total_bases", { data: "board + settled_leans", generate: true, product: false, missing: ["reliability (settles ~44%)"], unlock: "demoted until it clears the reliability floor", copy: "Total bases — shown, but excluded from products (weak history)." }),
  row("MLB", "pitcher_strikeouts", { data: "board + settled_leans", generate: true, product: false, missing: ["reliability (~47.5%)"], unlock: "demoted", copy: "Strikeouts — informational; net-negative history." }),
  row("MLB", "team_totals", { data: "Odds API", generate: true, product: false, missing: ["a team+over/under+line binding on the card leg"], unlock: "wire the leg schema (team, side, line)", copy: "Per-team runs — settlement not fully wired yet." }),
  // ── Soccer / World Cup ──
  row("Soccer", "moneyline_90", { data: "Odds API + API-Football", generate: true, product: true, unlock: "live", copy: "90-minute match result." }),
  row("Soccer", "double_chance", { data: "Odds API + API-Football", generate: true, product: true, unlock: "live", copy: "Two of the three results." }),
  row("Soccer", "draw_no_bet", { data: "Odds API + API-Football", generate: true, product: true, unlock: "live", copy: "Pick a side; a draw is a push." }),
  row("Soccer", "match_total_goals", { data: "Odds API + API-Football", generate: true, product: true, unlock: "live", copy: "Over/under on total goals." }),
  row("Soccer", "btts", { data: "Odds API + API-Football", generate: true, product: true, unlock: "live", copy: "Both teams to score." }),
  row("Soccer", "asian_handicap", { data: "Odds API (expanded)", generate: true, product: false, missing: ["a tested AH quarter-line settler"], unlock: "build + test the AH settler", copy: "Asian handicap — shown, not yet settlement-wired." }),
  row("Soccer", "team_totals", { data: "Odds API (expanded)", generate: true, product: false, missing: ["per-team goal line settlement"], unlock: "wire per-team settlement", copy: "Team totals — informational only." }),
  // ── UFC ──
  row("UFC", "moneyline", { data: "none committed", generate: false, product: false, missing: ["events", "fight card", "odds provider"], unlock: "add a UFC odds + results provider (see UFC readiness)", copy: "UFC is in readiness — no fabricated fights.", statusOverride: "provider_needed" }),
  row("UFC", "method_of_victory", { data: "none", generate: false, product: false, missing: ["provider"], unlock: "provider + method model", copy: "KO/sub/decision — coming with a provider.", statusOverride: "provider_needed" }),
  row("UFC", "round_totals", { data: "none", generate: false, product: false, missing: ["provider"], unlock: "provider", copy: "Round over/under — coming.", statusOverride: "provider_needed" }),
  // ── Future ──
  row("NBA", "player_props", { data: "board (off-season)", generate: false, product: false, missing: ["active season", "reliability"], unlock: "resume in-season + calibrate", copy: "NBA returns in-season.", statusOverride: "coming_soon" }),
  row("NFL", "any", { data: "none", generate: false, product: false, missing: ["season", "provider"], unlock: "season + provider", copy: "NFL is future scope.", statusOverride: "coming_soon" }),
];

function main() {
  const byStatus = ROWS.reduce((m, r) => { m[r.status] = (m[r.status] ?? 0) + 1; return m; }, {});
  const out = {
    kind: "market-coverage-matrix", public: false, internal: true, officialMoneyRecordAffected: false,
    asOf: "2026-07-10",
    legend: {
      available: "pick + paper settlement + product all work",
      settlement_supported_data_needed: "settlement wired, awaiting slate data",
      data_available_settlement_needed: "can show a pick, can't settle a paper card yet",
      provider_needed: "no data provider wired — nothing generated",
      coming_soon: "planned; out of season or future scope",
    },
    counts: { total: ROWS.length, byStatus },
    rows: ROWS,
    guarantee: "A market that cannot generate a pick (canGeneratePick:false) NEVER produces a fabricated pick anywhere on the site. Unavailable = shown as unavailable.",
    note: "INTERNAL readiness map. MLB/Soccer settleability is derived from the live settlement wiring (candidate-leg). UFC/NBA/NFL are honestly not live. Not web-served.",
  };
  if (WRITE) { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(path.join(OUT_DIR, "coverage-matrix.json"), JSON.stringify(out, null, 2) + "\n"); }
  console.log(`[coverage-matrix] ${WRITE ? "WROTE" : "DRY-RUN"} · ${ROWS.length} rows · ${JSON.stringify(byStatus)}`);
  if (!WRITE) console.log("  (dry run — pass --write)");
}

main();
