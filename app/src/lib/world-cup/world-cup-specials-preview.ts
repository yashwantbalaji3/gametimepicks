/**
 * INTERNAL PREVIEW — June 20 World Cup Specials, REBUILT with a player role-quality gate.
 *
 * This is the review-only June 20 build: it reads the isolated preview data under
 * `public/data/previews/june20/` (real odds + API-Football identity, pulled live; production June 19
 * artifacts are untouched), screens every player prop through `player-role-quality.ts` so only
 * role-confirmed / projected-starter / key-attacker props can enter a card, and then reuses the shared
 * World Cup Specials engine (`generateWorldCupSpecials`) for the odds discipline, combination spread,
 * and ranking. Bench / rotation-risk / defender-on-attacking-prop / goalkeeper / unknown-role players
 * are excluded with explicit reasons + counts.
 *
 * Preview-only: nothing here touches production surfaces or active Bank Builder / Moonshot / Mr. Dub
 * artifacts. Lineups are not posted pre-event, so roles are PROJECTED (market-implied), never claimed
 * as confirmed starters. No fabrication.
 */
import fs from "node:fs";
import path from "node:path";
import { wcTeamCodeFromName } from "@/lib/data-world-cup";
import {
  WORLD_CUP_SPECIALS_CONFIG,
  legOddsInRange,
  generateWorldCupSpecials,
  type SpecialLeg,
  type WorldCupSpecialCard,
} from "./world-cup-specials";
import {
  classifyPlayerRoles,
  roleKeyForRow,
  ROLE_ELIGIBLE_TIERS,
  type PlayerRoleQuality,
} from "./player-role-quality";

export const JUNE20_SPECIALS_CONFIG = {
  ...WORLD_CUP_SPECIALS_CONFIG,
  date: "2026-06-20",
  minLegsPerCard: 4,
  maxLegsPerCard: 9,
  requireRoleQuality: true,
} as const;

const PREVIEW_DIR = ["previews", "june20"];

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

export interface June20RoleDiagnostics {
  cardsGenerated: number;
  eligibleTeamLegs: number;
  eligiblePlayerLegs: number;       // in-range player props (pre role gate)
  acceptedPlayerLegs: number;       // in-range AND role-eligible
  excludedBenchRisk: number;
  excludedUnknownRole: number;
  excludedRotationRisk: number;     // regular_rotation (incl. defenders on attacking props)
  excludedOutOfLegOddsRange: number;
  excludedOutOfCombinedOddsRange: number;
  excludedStarted: number;
  roleQualityNotes: string[];
}

export interface June20SpecialsPreview {
  date: string;
  generatedAt: string;
  lineupsPosted: boolean;
  preview: true;
  config: typeof JUNE20_SPECIALS_CONFIG;
  games: Array<{ fixture: string; kickoffUtc: string | null }>;
  cards: WorldCupSpecialCard[];
  diagnostics: June20RoleDiagnostics;
  roleBreakdown: { eligible: RoleRow[]; excluded: RoleRow[] };
  notes: string[];
}

export interface RoleRow {
  player: string;
  team: string;
  position: string | null;
  roleTier: string;
  reason: string;
}

interface FixtureMeta { eventId: string; kickoffUtc: string | null; home: string; away: string }

function readPreview(root: string, file: string): any | null {
  try { return JSON.parse(fs.readFileSync(path.join(root, ...PREVIEW_DIR, file), "utf8")); }
  catch { return null; }
}

function fixtureIndex(teamDoc: any): Map<string, FixtureMeta> {
  const out = new Map<string, FixtureMeta>();
  for (const r of teamDoc?.matches ?? []) {
    const fixture = `${r.homeTeam} vs ${r.awayTeam}`;
    if (!out.has(fixture)) out.set(fixture, { eventId: String(r.matchId), kickoffUtc: r.kickoffUtc ?? null, home: r.homeTeam, away: r.awayTeam });
  }
  return out;
}

function teamForPick(market: string, pickLabel: string, home: string, away: string): string | null {
  if (market === "match_total_goals" || market === "btts") return null;
  const lc = pickLabel.toLowerCase();
  if (lc.includes(home.toLowerCase())) return home;
  if (lc.includes(away.toLowerCase())) return away;
  return null;
}

/** Build the role-screened June 20 Specials preview from the isolated `previews/june20/` data. */
export function buildJune20SpecialsPreview(opts: { root?: string; nowIso: string }): June20SpecialsPreview {
  const root = opts.root ?? path.join(process.cwd(), "public", "data");
  const cfg = JUNE20_SPECIALS_CONFIG;
  const team = readPreview(root, "projections.json");
  const pp = readPreview(root, "player-projections.json");
  const lineupsPosted = pp?.lineupsPosted === true;
  const fixtures = fixtureIndex(team);
  const games = Array.from(fixtures.values()).map((f) => ({ fixture: `${f.home} vs ${f.away}`, kickoffUtc: f.kickoffUtc }));

  const diag: June20RoleDiagnostics = {
    cardsGenerated: 0, eligibleTeamLegs: 0, eligiblePlayerLegs: 0, acceptedPlayerLegs: 0,
    excludedBenchRisk: 0, excludedUnknownRole: 0, excludedRotationRisk: 0,
    excludedOutOfLegOddsRange: 0, excludedOutOfCombinedOddsRange: 0, excludedStarted: 0, roleQualityNotes: [],
  };
  const notes: string[] = [];

  if (!team || !pp) {
    notes.push("June 20 preview data not found — run the June 20 pull into previews/june20/.");
    return { date: cfg.date, generatedAt: opts.nowIso, lineupsPosted, preview: true, config: cfg, games, cards: [], diagnostics: diag, roleBreakdown: { eligible: [], excluded: [] }, notes };
  }

  // ── Team legs (in-range, pre-event) ────────────────────────────────────────────────────────────
  const teamLegs: SpecialLeg[] = [];
  for (const r of team.matches ?? []) {
    const mk = TEAM_MARKET_LABEL[r.market];
    if (!mk) continue;
    const odds = typeof r.americanOdds === "number" ? r.americanOdds : null;
    if (odds == null) continue;
    if (!legOddsInRange(odds)) { diag.excludedOutOfLegOddsRange++; continue; }
    const startTime: string | null = r.kickoffUtc ?? null;
    if (!startTime || startTime <= opts.nowIso) { diag.excludedStarted++; continue; }
    const fixture = `${r.homeTeam} vs ${r.awayTeam}`;
    const refTeam = teamForPick(r.market, String(r.pickLabel ?? ""), r.homeTeam, r.awayTeam);
    teamLegs.push({
      legId: `wc-special-jun20:team:${r.matchId}:${r.market}`,
      kind: "team", sport: "WORLD_CUP", fixture, eventId: String(r.matchId),
      participant: String(r.pickLabel ?? r.market), team: refTeam,
      opponent: refTeam ? (refTeam === r.homeTeam ? r.awayTeam : r.homeTeam) : null,
      countryCode: refTeam ? wcTeamCodeFromName(refTeam) : null,
      playerId: null, photoUrl: null, market: r.market, marketLabel: mk.label,
      side: r.market === "match_total_goals" || r.market === "btts" ? String(r.pickLabel ?? "") : null,
      line: typeof r.line === "number" ? r.line : null,
      odds, modelProbability: typeof r.modelProbability === "number" ? r.modelProbability : 0,
      startTime, dataQuality: "B", confidence: String(r.confidence ?? "Lean"),
      settlement: mk.settlement, limitedData: false,
    });
  }
  diag.eligibleTeamLegs = teamLegs.length;

  // ── Player roles (the gate) ────────────────────────────────────────────────────────────────────
  const roleMap = classifyPlayerRoles(pp.matches ?? [], lineupsPosted);
  const eligibleRows: RoleRow[] = [], excludedRows: RoleRow[] = [];
  const seenRole = new Set<string>();
  for (const q of roleMap.values()) {
    const row: RoleRow = { player: q.playerName, team: q.teamName, position: q.position, roleTier: q.roleTier, reason: q.reason };
    if (q.eligibleForSpecials) eligibleRows.push(row); else excludedRows.push(row);
  }

  // ── Player legs (in-range AND role-eligible) ────────────────────────────────────────────────────
  const playerLegs: SpecialLeg[] = [];
  for (const r of pp.matches ?? []) {
    const mk = PLAYER_MARKET_LABEL[r.market];
    if (!mk) continue;
    if (r.projectionStatus && r.projectionStatus !== "active") continue;
    const odds = typeof r.americanOdds === "number" ? r.americanOdds : null;
    if (odds == null) continue;
    if (!legOddsInRange(odds)) { diag.excludedOutOfLegOddsRange++; continue; }
    const fx = fixtures.get(String(r.fixture));
    if (!fx) continue;
    const startTime = fx.kickoffUtc;
    if (!startTime || startTime <= opts.nowIso) { diag.excludedStarted++; continue; }
    diag.eligiblePlayerLegs++;

    const role = roleMap.get(roleKeyForRow(r));
    if (!role || !ROLE_ELIGIBLE_TIERS.has(role.roleTier)) {
      // Role gate rejection — bucket by reason for the diagnostics.
      const t = role?.roleTier;
      if (t === "bench_risk") diag.excludedBenchRisk++;
      else if (t === "unknown" || !t) diag.excludedUnknownRole++;
      else diag.excludedRotationRisk++;
      continue;
    }

    const player = r.player ?? {};
    const team = player.team ?? null;
    const opponent = team === fx.home ? fx.away : fx.home;
    const side = String(r.pick ?? (r.market === "player_goal_scorer_anytime" || r.market === "player_assists" ? "Yes" : "Over"));
    playerLegs.push({
      legId: `wc-special-jun20:player:${fx.eventId}:${r.market}:${player.id ?? player.name}`,
      kind: "player", sport: "WORLD_CUP", fixture: `${fx.home} vs ${fx.away}`, eventId: fx.eventId,
      participant: String(player.name ?? "Player"), team, opponent,
      countryCode: team ? wcTeamCodeFromName(team) : null,
      playerId: player.id != null ? Number(player.id) : null,
      photoUrl: typeof player.photo === "string" ? player.photo : null,
      market: r.market, marketLabel: mk.label, side,
      line: typeof r.line === "number" ? r.line : null,
      odds, modelProbability: typeof r.modelProbability === "number" ? r.modelProbability : 0,
      startTime, dataQuality: "limited", confidence: String(r.confidence ?? "Lower confidence"),
      settlement: mk.settlement, limitedData: true,
      roleTier: role.roleTier, roleEvidence: role.evidence,
      lineupNote: lineupsPosted ? "lineups posted — confirmed role" : "lineups not posted — projected role (market-implied)",
    });
  }
  diag.acceptedPlayerLegs = playerLegs.length;
  diag.roleQualityNotes = [
    `${eligibleRows.length} players passed the role gate (projected starters / key attackers); ${excludedRows.length} excluded.`,
    `Excluded player legs: ${diag.excludedRotationRisk} rotation/defender, ${diag.excludedBenchRisk} goalkeeper, ${diag.excludedUnknownRole} unknown role.`,
    lineupsPosted ? "Lineups posted — roles confirmed." : "Lineups not posted — roles are projected from market prominence + position (limited-data).",
  ];

  // ── Reuse the shared engine for odds discipline + spread + ranking ──────────────────────────────
  const base = generateWorldCupSpecials(teamLegs, playerLegs, {
    date: cfg.date, generatedAt: opts.nowIso, excludeSignatures: [], excludedStartedGames: [],
  });
  diag.excludedOutOfCombinedOddsRange = base.diagnostics.rejectedOutOfCombinedOddsRange;
  diag.cardsGenerated = base.cards.length;

  // Enrich each card with a role-quality summary + a role line in "why this card".
  const cards = base.cards.map((c) => enrichCard(c, lineupsPosted));
  if (cards.length < cfg.count) {
    notes.push(`Generated ${cards.length} of ${cfg.count} role-screened cards from ${games.length} pre-event games (role gate is intentionally strict — bench/rotation props are excluded, not forced in).`);
  }

  return {
    date: cfg.date, generatedAt: opts.nowIso, lineupsPosted, preview: true, config: cfg, games,
    cards, diagnostics: diag, roleBreakdown: { eligible: eligibleRows, excluded: excludedRows }, notes,
  };
}

function enrichCard(card: WorldCupSpecialCard, lineupsPosted: boolean): WorldCupSpecialCard {
  const players = card.legs.filter((l) => l.kind === "player");
  const keyN = players.filter((l) => l.roleTier === "key_attacker" || l.roleTier === "confirmed_starter").length;
  const projN = players.filter((l) => l.roleTier === "projected_starter").length;
  const roleQualitySummary = `${players.length} player prop${players.length === 1 ? "" : "s"} — all role-screened: ${keyN} key attacker${keyN === 1 ? "" : "s"}, ${projN} projected starter${projN === 1 ? "" : "s"}${lineupsPosted ? "" : " (lineups pending — projected roles)"}.`;
  return {
    ...card,
    roleQualitySummary,
    whyThisCard: [card.whyThisCard[0], roleQualitySummary, ...card.whyThisCard.slice(1)],
  };
}

/** Load the committed June 20 preview snapshot (the preview route reads this). */
export function loadJune20SpecialsPreview(rootOverride?: string): June20SpecialsPreview | null {
  try {
    const root = rootOverride ?? path.join(process.cwd(), "public", "data");
    return JSON.parse(fs.readFileSync(path.join(root, ...PREVIEW_DIR, "world-cup-specials.json"), "utf8")) as June20SpecialsPreview;
  } catch {
    return null;
  }
}
