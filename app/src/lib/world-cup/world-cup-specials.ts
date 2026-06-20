/**
 * World Cup Specials — a homepage-only feature box of 5 Moonshot-style, World-Cup-ONLY paper parlays.
 * Separate from both the disciplined Dual Bank Builder AND the Moonshot Lane. Built from REAL posted
 * team markets (moneyline / double chance / total goals / BTTS / draw-no-bet) + REAL posted player-prop
 * markets (anytime goalscorer / shots / shots on target / assists), under a strict odds discipline:
 *
 *   • combined odds  : > +700  and < +3000
 *   • per-leg odds   : > -250  and < +200   (rejects extreme favourites like Brazil ML -1100 and
 *                                            Turkey-or-Draw -400, and extreme longshots > +200)
 *   • leg mix        : >= 2 team props, >= 2 player props, >= 2 distinct games per card
 *   • pre-event only : every leg's kickoff is in the future (started games are excluded)
 *
 * Honest by construction: no fabricated markets (only the posted ones are mapped — there is no
 * "score or assist" combined market and no "team first to score" market in the feed, so neither is
 * invented), no fabricated photos/flags, settlement from official sources only, and player props are
 * labelled limited-data / market-implied (lineups not yet posted). Higher-variance by design — never
 * described as lower-risk. Paper-only. Server-only loaders read public artifacts; the generator core
 * is pure + deterministic (no Date.now / Math.random — `nowIso` is injected).
 *
 * This module NEVER touches the Moonshot or Bank Builder active artifacts — it only EXCLUDES an exact
 * duplicate of those active cards from the Specials it suggests.
 */
import fs from "node:fs";
import path from "node:path";
import { combinedAmerican, combinedDecimal, combinedHitProbability } from "@/lib/parlays/odds-math";
import { wcTeamCodeFromName } from "@/lib/data-world-cup";

// ── Config ─────────────────────────────────────────────────────────────────────────────────────
export const WORLD_CUP_SPECIALS_CONFIG = {
  count: 5,
  stakePreview: 10,
  minCombinedOdds: 700,
  maxCombinedOdds: 3000,
  minLegOdds: -250,
  maxLegOdds: 200,
  minTeamPropsPerCard: 2,
  minPlayerPropsPerCard: 2,
  minGamesPerCard: 2,
  maxCardsShown: 5,
  scope: "world_cup",
} as const;

export type WorldCupSpecialsConfig = typeof WORLD_CUP_SPECIALS_CONFIG;

/** A leg's per-leg odds qualifies when STRICTLY inside the band: rejects -250/-251/+200/+201. */
export function legOddsInRange(odds: number | null | undefined, cfg: WorldCupSpecialsConfig = WORLD_CUP_SPECIALS_CONFIG): boolean {
  return typeof odds === "number" && Number.isFinite(odds) && odds > cfg.minLegOdds && odds < cfg.maxLegOdds;
}
/** A card's combined odds qualifies when STRICTLY inside the band: +701..+2999. */
export function combinedOddsInRange(odds: number | null | undefined, cfg: WorldCupSpecialsConfig = WORLD_CUP_SPECIALS_CONFIG): boolean {
  return typeof odds === "number" && Number.isFinite(odds) && odds > cfg.minCombinedOdds && odds < cfg.maxCombinedOdds;
}

// ── Types ──────────────────────────────────────────────────────────────────────────────────────
export interface SpecialLeg {
  legId: string;
  kind: "team" | "player";
  sport: "WORLD_CUP";
  fixture: string;
  eventId: string;
  participant: string;          // team name (team leg) or player name (player leg)
  team: string | null;          // the team this leg belongs to (null for match-level totals/BTTS)
  opponent: string | null;
  countryCode: string | null;   // flag, when the leg references a single team
  playerId: number | null;
  photoUrl: string | null;      // real API-Football headshot when present, else null
  market: string;               // raw market key
  marketLabel: string;          // display label (exact posted label — never renamed)
  side: string | null;
  line: number | null;
  odds: number;
  modelProbability: number;
  startTime: string | null;
  dataQuality: string;          // "B" team / "limited" player
  confidence: string;
  settlement: string;           // official settlement rule
  limitedData: boolean;         // player props pre-lineups
  // Optional role-quality fields — populated by the role-screened (preview) builder; absent on the
  // original production specials so this stays backward-compatible.
  roleTier?: string;
  roleEvidence?: string[];
  lineupNote?: string;
}

export interface WorldCupSpecialCard {
  id: string;
  title: string;
  risk: "longshot";
  label: "World Cup Special";
  stakePreview: number;
  combinedOdds: number;
  projectedReturn: number;
  decimalOdds: number;
  jointModelProbability: number;
  games: string[];
  legs: SpecialLeg[];
  teamPropCount: number;
  playerPropCount: number;
  correlationProfile: string;
  dataQuality: string;
  whyThisCard: string[];
  whyItCanFail: string[];
  settlementNotes: string[];
  diagnostics: string[];
  roleQualitySummary?: string; // optional — set by the role-screened (preview) builder
}

export interface SpecialsDiagnostics {
  eligibleTeamLegs: number;
  eligiblePlayerLegs: number;
  preEventGames: number;
  excludedStartedGames: string[];
  rejectedOutOfLegOddsRange: number;
  rejectedOutOfCombinedOddsRange: number;
  rejectedStarted: number;
  rejectedDuplicates: number;
  activeMoonshotCardExcluded: boolean;
  activeBankBuilderCardExcluded: boolean;
  notes: string[];
}

export interface WorldCupSpecialsResult {
  date: string;
  generatedAt: string;
  config: WorldCupSpecialsConfig;
  cards: WorldCupSpecialCard[];
  diagnostics: SpecialsDiagnostics;
}

// ── Market maps (posted markets only — never invent one) ─────────────────────────────────────────
const TEAM_MARKET_LABEL: Record<string, { label: string; settlement: string }> = {
  moneyline_90: { label: "Moneyline (90′)", settlement: "official 90-minute regulation result (ESPN/FIFA)" },
  double_chance: { label: "Double Chance", settlement: "official 90-minute result — win or draw" },
  match_total_goals: { label: "Total Goals", settlement: "official 90-minute combined goals" },
  btts: { label: "Both Teams To Score", settlement: "official 90-minute goals — each side scores" },
  draw_no_bet: { label: "Draw No Bet", settlement: "official 90-minute result — push on a draw" },
};
const PLAYER_MARKET_LABEL: Record<string, { label: string; settlement: string }> = {
  player_goal_scorer_anytime: { label: "Anytime Goalscorer", settlement: "official goal in regulation (ESPN/FIFA)" },
  player_shots_on_target: { label: "Shots on Target", settlement: "official shots-on-target stat" },
  player_assists: { label: "Assists", settlement: "official assist stat" },
  player_shots: { label: "Shots", settlement: "official shots stat" },
};

const dec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));

// ── Loaders (server-only) ────────────────────────────────────────────────────────────────────────
interface FixtureMeta { eventId: string; kickoffUtc: string | null; home: string; away: string }

function fixtureIndex(root: string): Map<string, FixtureMeta> {
  const out = new Map<string, FixtureMeta>();
  try {
    const team = JSON.parse(fs.readFileSync(path.join(root, "world-cup", "projections", "latest.json"), "utf8"));
    for (const r of team.matches ?? []) {
      const fixture = `${r.homeTeam} vs ${r.awayTeam}`;
      if (!out.has(fixture)) out.set(fixture, { eventId: String(r.matchId), kickoffUtc: r.kickoffUtc ?? null, home: r.homeTeam, away: r.awayTeam });
    }
  } catch { /* no team projections */ }
  return out;
}

/**
 * The team name a team-market pick references, if any (moneyline / DC / DNB). Match-level markets
 * (total goals, BTTS) reference no single team → returns null (rendered as a match-level leg).
 */
function teamForPick(market: string, pickLabel: string, home: string, away: string): string | null {
  if (market === "match_total_goals" || market === "btts") return null;
  const lc = pickLabel.toLowerCase();
  if (lc.includes(home.toLowerCase())) return home;
  if (lc.includes(away.toLowerCase())) return away;
  return null;
}

/** In-range, pre-event World Cup TEAM legs from the posted team-market projections. */
export function loadSpecialsTeamLegs(root: string, nowIso: string, date: string): SpecialLeg[] {
  let team: { matches?: Array<Record<string, any>>; date?: string };
  try {
    team = JSON.parse(fs.readFileSync(path.join(root, "world-cup", "projections", "latest.json"), "utf8"));
  } catch { return []; }
  if (!date || (team.date && team.date !== date)) return [];
  const legs: SpecialLeg[] = [];
  for (const r of team.matches ?? []) {
    const mk = TEAM_MARKET_LABEL[r.market];
    if (!mk) continue;
    const odds = typeof r.americanOdds === "number" ? r.americanOdds : null;
    if (!legOddsInRange(odds)) continue;
    const startTime: string | null = r.kickoffUtc ?? null;
    if (!startTime || startTime <= nowIso) continue; // pre-event only
    const fixture = `${r.homeTeam} vs ${r.awayTeam}`;
    const refTeam = teamForPick(r.market, String(r.pickLabel ?? ""), r.homeTeam, r.awayTeam);
    const opponent = refTeam ? (refTeam === r.homeTeam ? r.awayTeam : r.homeTeam) : null;
    legs.push({
      legId: `wc-special:team:${r.matchId}:${r.market}`,
      kind: "team", sport: "WORLD_CUP", fixture, eventId: String(r.matchId),
      participant: String(r.pickLabel ?? r.market), team: refTeam, opponent,
      countryCode: refTeam ? wcTeamCodeFromName(refTeam) : null,
      playerId: null, photoUrl: null,
      market: r.market, marketLabel: mk.label,
      side: r.market === "match_total_goals" || r.market === "btts" ? String(r.pickLabel ?? "") : null,
      line: typeof r.line === "number" ? r.line : null,
      odds: odds as number, modelProbability: typeof r.modelProbability === "number" ? r.modelProbability : 0,
      startTime, dataQuality: "B", confidence: String(r.confidence ?? "Lean"),
      settlement: mk.settlement, limitedData: false,
    });
  }
  return legs;
}

/** In-range, pre-event World Cup PLAYER-PROP legs from the posted player-prop projections. */
export function loadSpecialsPlayerLegs(root: string, nowIso: string, date: string): SpecialLeg[] {
  let pp: { matches?: Array<Record<string, any>>; date?: string };
  try {
    pp = JSON.parse(fs.readFileSync(path.join(root, "world-cup", "player-projections", "latest.json"), "utf8"));
  } catch { return []; }
  if (!date || (pp.date && pp.date !== date)) return [];
  const fixtures = fixtureIndex(root);
  const legs: SpecialLeg[] = [];
  for (const r of pp.matches ?? []) {
    const mk = PLAYER_MARKET_LABEL[r.market];
    if (!mk) continue;
    if (r.projectionStatus && r.projectionStatus !== "active") continue;
    const odds = typeof r.americanOdds === "number" ? r.americanOdds : null;
    if (!legOddsInRange(odds)) continue;
    const fx = fixtures.get(String(r.fixture));
    if (!fx) continue; // can't join to a fixture → can't settle/group by game
    const startTime = fx.kickoffUtc;
    if (!startTime || startTime <= nowIso) continue; // pre-event only
    const player = r.player ?? {};
    const team = player.team ?? null;
    const opponent = team === fx.home ? fx.away : fx.home;
    const side = String(r.pick ?? (r.market === "player_goal_scorer_anytime" || r.market === "player_assists" ? "Yes" : "Over"));
    legs.push({
      legId: `wc-special:player:${fx.eventId}:${r.market}:${player.id ?? player.name}`,
      kind: "player", sport: "WORLD_CUP", fixture: `${fx.home} vs ${fx.away}`, eventId: fx.eventId,
      participant: String(player.name ?? "Player"), team, opponent,
      countryCode: team ? wcTeamCodeFromName(team) : null,
      playerId: player.id != null ? Number(player.id) : null,
      photoUrl: typeof player.photo === "string" ? player.photo : null,
      market: r.market, marketLabel: mk.label,
      side, line: typeof r.line === "number" ? r.line : null,
      odds: odds as number, modelProbability: typeof r.modelProbability === "number" ? r.modelProbability : 0,
      startTime, dataQuality: "limited", confidence: String(r.confidence ?? "Lower confidence"),
      settlement: mk.settlement, limitedData: true,
    });
  }
  return legs;
}

// ── Generator core (pure) ────────────────────────────────────────────────────────────────────────
/** Identity used to compare a Special's legs against the active Moonshot / Bank Builder cards. */
function legMatchKey(fixture: string, marketLabel: string, participant: string, side: string | null, line: number | null): string {
  const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${norm(fixture)}|${norm(marketLabel)}|${norm(participant)}|${norm(side)}|${line ?? ""}`;
}
function cardSignature(legs: Array<{ fixture: string; marketLabel: string; participant: string; side: string | null; line: number | null }>): string {
  return legs.map((l) => legMatchKey(l.fixture, l.marketLabel, l.participant, l.side, l.line)).sort().join("||");
}

const PICK_LABEL = (l: SpecialLeg) =>
  `${l.marketLabel}${l.side && l.kind === "player" ? ` ${l.side}` : ""}${l.line != null ? ` ${l.line}` : ""}`.trim();

/** "team-result" markets (moneyline / DC / DNB) — at most one per team per card (they're redundant). */
const TEAM_RESULT_MARKETS = new Set(["moneyline_90", "double_chance", "draw_no_bet"]);

/** Hard contradiction / duplicate between two legs (these can never co-exist in one card). */
function legsConflict(a: SpecialLeg, b: SpecialLeg): boolean {
  if (a.legId === b.legId) return true;
  // Same player appearing twice (any markets) — keep cards clean + diverse.
  if (a.kind === "player" && b.kind === "player" && a.playerId != null && a.playerId === b.playerId) return true;
  if (a.eventId !== b.eventId) return false; // cross-game legs never contradict
  // Same match-level market with opposite sides (BTTS Yes vs No, Over vs Under).
  if (a.market === b.market && (a.market === "btts" || a.market === "match_total_goals")) return true;
  // Two redundant team-result markets for the SAME team (e.g. Turkey ML + Turkey DNB).
  if (TEAM_RESULT_MARKETS.has(a.market) && TEAM_RESULT_MARKETS.has(b.market) && a.team && a.team === b.team) return true;
  return false;
}

function cardValid(legs: SpecialLeg[], cfg: WorldCupSpecialsConfig): boolean {
  for (let i = 0; i < legs.length; i++)
    for (let j = i + 1; j < legs.length; j++)
      if (legsConflict(legs[i], legs[j])) return false;
  const team = legs.filter((l) => l.kind === "team").length;
  const player = legs.filter((l) => l.kind === "player").length;
  const games = new Set(legs.map((l) => l.eventId)).size;
  return team >= cfg.minTeamPropsPerCard && player >= cfg.minPlayerPropsPerCard && games >= cfg.minGamesPerCard;
}

/** Mean same-game pair fraction — a light, honest correlation estimate (0 = all cross-game). */
function meanSameGameCorrelation(legs: SpecialLeg[]): number {
  let pairs = 0, same = 0;
  for (let i = 0; i < legs.length; i++)
    for (let j = i + 1; j < legs.length; j++) {
      pairs++;
      if (legs[i].eventId === legs[j].eventId) same++;
    }
  return pairs ? (same / pairs) * 0.4 : 0; // same-game attacking/result legs ~ mildly positive
}

const isOverish = (l: SpecialLeg) =>
  (l.market === "match_total_goals" && /over/i.test(l.side ?? l.participant)) ||
  (l.market === "btts" && /yes/i.test(l.participant));

/**
 * Honest same-game correlation classifier. A POSITIVE (intentional) stack is a same-game pair that
 * moves together: an Over/BTTS-Yes total + any attacking player in that game, or a team-result market
 * for team X + an attacking player ON team X. Cross-team same-game pairs (e.g. a team market + the
 * opponent's player) are "mixed", not a positive stack — disclosed as such, not overclaimed.
 */
function classifyCorrelation(legs: SpecialLeg[]): { profile: string; intentionalStack: boolean } {
  let positive = false, anySameGame = false;
  for (let i = 0; i < legs.length; i++)
    for (let j = i + 1; j < legs.length; j++) {
      const a = legs[i], b = legs[j];
      if (a.eventId !== b.eventId) continue;
      anySameGame = true;
      const [t, p] = a.kind === "player" ? [b, a] : [a, b]; // t = the (possible) team leg
      if (p.kind !== "player") continue;
      if (isOverish(t) && p.kind === "player") positive = true;                     // more goals ↔ a scorer/shot
      if (TEAM_RESULT_MARKETS.has(t.market) && t.team && p.team === t.team) positive = true; // team X wins ↔ team X attacker
    }
  if (positive) return { profile: "multi_game_with_intentional_stack", intentionalStack: true };
  if (anySameGame) return { profile: "multi_game_mixed_correlation", intentionalStack: false };
  return { profile: "multi_game_low_correlation", intentionalStack: false };
}

/** Curate a per-game player subset that spans the odds spectrum (favourites → plus-money upside). */
function curatePlayers(players: SpecialLeg[], perGame: number): SpecialLeg[] {
  const byGame = new Map<string, SpecialLeg[]>();
  for (const l of players) (byGame.get(l.eventId) ?? byGame.set(l.eventId, []).get(l.eventId)!).push(l);
  const out: SpecialLeg[] = [];
  for (const list of byGame.values()) {
    const sorted = [...list].sort((a, b) => a.odds - b.odds); // shortest (favourite) → longest (upside)
    if (sorted.length <= perGame) { out.push(...sorted); continue; }
    // Evenly sample across the odds spectrum so cards can reach both low and high combined targets.
    const picks: SpecialLeg[] = [];
    for (let i = 0; i < perGame; i++) picks.push(sorted[Math.round((i * (sorted.length - 1)) / (perGame - 1))]);
    out.push(...Array.from(new Set(picks)));
  }
  return out;
}

/** Enumerate valid leg combinations (bounded) — distinct, constraint-satisfying, in-range cards. */
function enumerate(pool: SpecialLeg[], legCounts: number[], cfg: WorldCupSpecialsConfig): { combo: SpecialLeg[]; combined: number }[] {
  const sorted = [...pool].sort((a, b) => b.modelProbability - a.modelProbability);
  const out: { combo: SpecialLeg[]; combined: number }[] = [];
  const seen = new Set<string>();
  const n = sorted.length;
  for (const L of legCounts) {
    const idx: number[] = [];
    const rec = (start: number) => {
      if (idx.length === L) {
        const combo = idx.map((i) => sorted[i]);
        if (!cardValid(combo, cfg)) return;
        const combined = combinedAmerican(combo.map((l) => l.odds));
        if (!combinedOddsInRange(combined, cfg)) return;
        const sig = cardSignature(combo);
        if (seen.has(sig)) return;
        seen.add(sig);
        out.push({ combo, combined: combined as number });
        return;
      }
      for (let i = start; i < n; i++) {
        // prune: even if we add the remaining shortest-priced legs we still need to be < maxCombined,
        // and adding more legs only raises odds — but legs can be either sign, so we don't hard-prune here.
        idx.push(i);
        rec(i + 1);
        idx.pop();
      }
    };
    rec(0);
  }
  return out;
}

/** Score a candidate (higher = better): sweet-spot odds, joint prob, team/player balance, low correlation, clarity. */
function scoreCard(combo: SpecialLeg[], combined: number): number {
  const joint = combinedHitProbability(combo.map((l) => l.modelProbability)) ?? 0;
  const team = combo.filter((l) => l.kind === "team").length;
  const player = combo.filter((l) => l.kind === "player").length;
  // sweet spot peaks at +1500 (spec prefers +1200..+1800), 0 at the band edges.
  const sweet = 1 - Math.min(1, Math.abs(combined - 1500) / 1500);
  const jointNorm = Math.min(1, joint / 0.08); // ~8% joint is a strong longshot
  const balance = 1 - Math.abs(team - player) / combo.length;
  const corr = 1 - meanSameGameCorrelation(combo);
  const clarity = combo.length <= 5 ? 1 : combo.length === 6 ? 0.7 : 0.4; // prefer 4–5 legs
  return 0.34 * sweet + 0.24 * jointNorm + 0.2 * balance + 0.12 * corr + 0.1 * clarity;
}

/** Jaccard overlap of two leg sets (for diversity selection). */
function overlap(a: SpecialLeg[], b: SpecialLeg[]): number {
  const sa = new Set(a.map((l) => l.legId)), sb = new Set(b.map((l) => l.legId));
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}

export interface GenerateOptions {
  date: string;
  generatedAt: string;
  config?: WorldCupSpecialsConfig;
  excludeSignatures?: string[]; // active Moonshot / Bank Builder card signatures to never duplicate
  excludedStartedGames?: string[];
  rejectedStarted?: number;
}

const WHY_STACK = "Includes an intentional same-game stack (a team market + a player from that game) — correlation-disclosed, not hidden.";

/** Pure generator: from the in-range, pre-event team + player pools, build up to 5 ranked Specials. */
export function generateWorldCupSpecials(
  teamLegs: SpecialLeg[],
  playerLegs: SpecialLeg[],
  opts: GenerateOptions,
): WorldCupSpecialsResult {
  const cfg = opts.config ?? WORLD_CUP_SPECIALS_CONFIG;
  const excluded = new Set(opts.excludeSignatures ?? []);
  const games = new Set([...teamLegs, ...playerLegs].map((l) => l.eventId));

  const diagnostics: SpecialsDiagnostics = {
    eligibleTeamLegs: teamLegs.length,
    eligiblePlayerLegs: playerLegs.length,
    preEventGames: games.size,
    excludedStartedGames: opts.excludedStartedGames ?? [],
    rejectedOutOfLegOddsRange: 0, // filtered upstream in the loaders (logged separately by the snapshot builder)
    rejectedOutOfCombinedOddsRange: 0,
    rejectedStarted: opts.rejectedStarted ?? 0,
    rejectedDuplicates: 0,
    activeMoonshotCardExcluded: false,
    activeBankBuilderCardExcluded: false,
    notes: [],
  };

  if (games.size < cfg.minGamesPerCard) {
    diagnostics.notes.push(`not_enough_valid_specials: only ${games.size} pre-event World Cup game(s) — a Special needs ${cfg.minGamesPerCard}.`);
    return { date: opts.date, generatedAt: opts.generatedAt, config: cfg, cards: [], diagnostics };
  }

  // Curate the player pool (span the odds spectrum per game) to bound the enumeration, then enumerate.
  const curated = curatePlayers(playerLegs, 7);
  const pool = [...teamLegs, ...curated];
  const candidates = enumerate(pool, [4, 5, 6], cfg);

  // Drop exact duplicates of the active Moonshot / Bank Builder cards.
  const kept = candidates.filter((c) => {
    const sig = cardSignature(c.combo);
    if (excluded.has(sig)) {
      diagnostics.rejectedDuplicates++;
      diagnostics.activeMoonshotCardExcluded = true; // we only seed Moonshot/BB sigs into `excluded`
      return false;
    }
    return true;
  });

  // Rank by quality, then SPREAD across the odds band so the 5 cards aren't all clustered at +1500:
  // pick the best, diverse card from each of 5 sub-bands covering +700..+3000.
  const ranked = kept
    .map((c) => ({ ...c, score: scoreCard(c.combo, c.combined) }))
    .sort((a, b) => b.score - a.score || a.combined - b.combined);

  const BANDS: Array<[number, number]> = [[700, 1050], [1050, 1450], [1450, 1900], [1900, 2400], [2400, 3000]];
  const chosen: typeof ranked = [];
  const tooSimilar = (cand: { combo: SpecialLeg[] }) =>
    chosen.some((ch) => overlap(cand.combo, ch.combo) > 0.5 || cardSignature(ch.combo) === cardSignature(cand.combo));

  for (const [lo, hi] of BANDS) {
    const pick = ranked.find((c) => c.combined > lo && c.combined <= hi && !tooSimilar(c));
    if (pick) chosen.push(pick);
  }
  // Fill any empty bands from the global ranked remainder (still distinct), preserving the target of 5.
  if (chosen.length < cfg.maxCardsShown)
    for (const cand of ranked) {
      if (chosen.length >= cfg.maxCardsShown) break;
      if (chosen.includes(cand) || tooSimilar(cand)) continue;
      chosen.push(cand);
    }
  // Present low → high combined odds.
  chosen.sort((a, b) => a.combined - b.combined);

  if (chosen.length < cfg.count) {
    diagnostics.notes.push(`not_enough_valid_specials: produced ${chosen.length} of ${cfg.count} (pool: ${teamLegs.length} team + ${playerLegs.length} player legs across ${games.size} pre-event games).`);
  }

  const cards: WorldCupSpecialCard[] = chosen.map((c, i) => buildCard(c.combo, c.combined, i, opts, cfg));
  return { date: opts.date, generatedAt: opts.generatedAt, config: cfg, cards, diagnostics };
}

function titleFor(legs: SpecialLeg[], combined: number): string {
  const players = legs.filter((l) => l.kind === "player");
  const scorers = players.filter((l) => l.market === "player_goal_scorer_anytime").length;
  const sot = players.filter((l) => l.market === "player_shots_on_target").length;
  const overs = legs.filter((l) => isOverish(l)).length;
  const tier = combined >= 2000 ? "longshot " : "";
  if (scorers >= 2) return `Multi-goalscorer ${tier}special`;
  if (scorers >= 1 && sot >= 1) return `Goalscorer + shots ${tier}special`;
  if (overs >= 1 && (scorers >= 1 || sot >= 1)) return `Goals-and-attackers ${tier}special`;
  if (sot >= 2) return `Shots-on-target ${tier}stack`;
  return `Two-game team & player ${tier}special`;
}

function buildCard(
  combo: SpecialLeg[],
  combined: number,
  index: number,
  opts: GenerateOptions,
  cfg: WorldCupSpecialsConfig,
): WorldCupSpecialCard {
  // Stable, story-clear ordering: team anchors first, then players by model probability.
  const legs = [...combo].sort((a, b) =>
    (a.kind === b.kind ? b.modelProbability - a.modelProbability : a.kind === "team" ? -1 : 1));
  const decimal = combinedDecimal(legs.map((l) => l.odds)) ?? dec(combined);
  const joint = combinedHitProbability(legs.map((l) => l.modelProbability)) ?? 0;
  const team = legs.filter((l) => l.kind === "team").length;
  const player = legs.filter((l) => l.kind === "player").length;
  const gameNames = Array.from(new Set(legs.map((l) => l.fixture)));
  const { profile, intentionalStack: stack } = classifyCorrelation(legs);
  const anchors = legs.filter((l) => l.kind === "team").slice(0, 2).map((l) => `${l.participant} (${l.marketLabel})`);
  const ups = legs.filter((l) => l.kind === "player").slice(0, 2).map((l) => `${l.participant} ${l.marketLabel}`);

  return {
    id: `wc-special-${opts.date}-${index + 1}`,
    title: titleFor(legs, combined),
    risk: "longshot",
    label: "World Cup Special",
    stakePreview: cfg.stakePreview,
    combinedOdds: combined,
    projectedReturn: Math.round(cfg.stakePreview * decimal * 100) / 100,
    decimalOdds: Math.round(decimal * 1000) / 1000,
    jointModelProbability: Math.round(joint * 1000) / 1000,
    games: gameNames,
    legs,
    teamPropCount: team,
    playerPropCount: player,
    correlationProfile: profile,
    dataQuality: "mixed (team B · player limited-data / market-implied)",
    whyThisCard: [
      `World Cup-only, ${gameNames.length} distinct games — a high-volatility, odds-backed paper longshot.`,
      `${team} team anchor${team === 1 ? "" : "s"} (${anchors.join(", ")}) carry the card; ${player} attacking player prop${player === 1 ? "" : "s"} (${ups.join(", ")}) supply the upside.`,
      ...(stack ? [WHY_STACK] : ["Legs spread across two games with no same-team alignment — mixed, mostly independent correlation."]),
    ],
    whyItCanFail: [
      `${legs.length} legs must ALL hit — joint model probability ≈ ${(joint * 100).toFixed(0)}%. Higher variance by design.`,
      "Player props are limited-data / market-implied (lineups not yet posted) — lower confidence than the team markets.",
      ...(stack ? ["The intentional same-game stack cuts both ways — a quiet game can sink multiple legs at once."] : ["A single upset in either game ends the card."]),
    ],
    settlementNotes: Array.from(new Set(legs.map((l) => l.settlement))),
    diagnostics: [
      `combined ${combined > 0 ? "+" : ""}${combined} (band +${cfg.minCombinedOdds}..+${cfg.maxCombinedOdds})`,
      `legs ${legs.length} · team ${team} · player ${player} · games ${gameNames.length}`,
      `every leg odds in (${cfg.minLegOdds}, ${cfg.maxLegOdds})`,
    ],
  };
}

// ── Snapshot build + load ────────────────────────────────────────────────────────────────────────
const SNAPSHOT_PATH = ["world-cup", "world-cup-specials.json"];

/** Active Moonshot / Bank Builder card signatures to exclude as exact Special duplicates. */
function activeCardSignatures(root: string): string[] {
  const sigs: string[] = [];
  const toLeg = (l: any) => ({ fixture: String(l.fixture ?? ""), marketLabel: String(l.marketLabel ?? l.market ?? ""), participant: String(l.participant ?? l.label ?? ""), side: l.side ?? null, line: l.line ?? null });
  try {
    const moon = JSON.parse(fs.readFileSync(path.join(root, "moonshot-lane", "active.json"), "utf8"));
    for (const step of moon.ladder ?? []) if (step?.card?.legs) sigs.push(cardSignature(step.card.legs.map(toLeg)));
  } catch { /* no moonshot */ }
  try {
    const dual = JSON.parse(fs.readFileSync(path.join(root, "methodology", "launch", "dual-bank-builder-active.json"), "utf8"));
    for (const laneKey of ["laneA", "laneB"]) {
      const lane = dual?.run?.[laneKey];
      if (lane?.legs) sigs.push(cardSignature(lane.legs.map(toLeg)));
    }
  } catch { /* no dual bank builder */ }
  return sigs;
}

/**
 * Build the full World Cup Specials result from the public data root (server-only). Loads the team +
 * player pools, applies the strict filters, excludes the active Moonshot/Bank Builder cards, and
 * returns the ranked 5 + diagnostics. Used by the snapshot script and by tests.
 */
export function buildWorldCupSpecials(opts: { root?: string; nowIso: string; date: string }): WorldCupSpecialsResult {
  const root = opts.root ?? path.join(process.cwd(), "public", "data");
  const teamLegs = loadSpecialsTeamLegs(root, opts.nowIso, opts.date);
  const playerLegs = loadSpecialsPlayerLegs(root, opts.nowIso, opts.date);

  // Honest diagnostics: which games kicked off (excluded), and started-leg rejections.
  const fixtures = fixtureIndex(root);
  const excludedStartedGames: string[] = [];
  for (const f of fixtures.values())
    if (f.kickoffUtc && f.kickoffUtc <= opts.nowIso) excludedStartedGames.push(`${f.home} vs ${f.away}`);

  const result = generateWorldCupSpecials(teamLegs, playerLegs, {
    date: opts.date,
    generatedAt: opts.nowIso,
    excludeSignatures: activeCardSignatures(root),
    excludedStartedGames,
  });
  // Surface the out-of-range / started rejection counts at the feed level for the snapshot diagnostics.
  result.diagnostics.rejectedOutOfLegOddsRange = countOutOfLegRange(root, opts.date);
  result.diagnostics.notes.unshift(
    `${excludedStartedGames.length} of ${fixtures.size} World Cup games already kicked off and were excluded (pre-event only).`,
  );
  return result;
}

/** Count posted WC markets (team + player) that exist but fall outside the strict per-leg odds band. */
function countOutOfLegRange(root: string, date: string): number {
  let n = 0;
  try {
    const team = JSON.parse(fs.readFileSync(path.join(root, "world-cup", "projections", "latest.json"), "utf8"));
    if (!team.date || team.date === date)
      for (const r of team.matches ?? [])
        if (TEAM_MARKET_LABEL[r.market] && typeof r.americanOdds === "number" && !legOddsInRange(r.americanOdds)) n++;
  } catch { /* ignore */ }
  try {
    const pp = JSON.parse(fs.readFileSync(path.join(root, "world-cup", "player-projections", "latest.json"), "utf8"));
    if (!pp.date || pp.date === date)
      for (const r of pp.matches ?? [])
        if (PLAYER_MARKET_LABEL[r.market] && typeof r.americanOdds === "number" && !legOddsInRange(r.americanOdds)) n++;
  } catch { /* ignore */ }
  return n;
}

/** Load the committed World Cup Specials snapshot (homepage). Returns null when missing/unparseable. */
export function loadWorldCupSpecials(rootOverride?: string): WorldCupSpecialsResult | null {
  try {
    const root = rootOverride ?? path.join(process.cwd(), "public", "data");
    return JSON.parse(fs.readFileSync(path.join(root, ...SNAPSHOT_PATH), "utf8")) as WorldCupSpecialsResult;
  } catch {
    return null;
  }
}

/** Every leg of every card is still pre-event relative to `nowIso` (render-time safety for the box). */
export function specialsAllPreEvent(result: WorldCupSpecialsResult | null, nowIso: string): boolean {
  if (!result || !result.cards.length) return false;
  return result.cards.every((c) => c.legs.every((l) => !!l.startTime && l.startTime > nowIso));
}
