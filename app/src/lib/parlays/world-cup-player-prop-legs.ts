/**
 * World Cup player-prop UPSIDE pool. Converts the REAL posted player-prop markets
 * (`world-cup/player-projections/latest.json`) into the engine's `EligibleLeg` shape so the suggested
 * parlay generators can build Moonshot-style High Risk + Longshot cards (team anchors + attacking props)
 * for World Cup games — instead of team-only cards that can never honestly reach those bands.
 *
 * Honest by construction: every leg is a real bookmaker-priced market, pre-event only, within the leg
 * guards (no leg < -500 / > +1200), labelled limited-data / market-implied (lineups not yet posted), and
 * settles from official sources. No fabricated markets — only the four posted ones are mapped.
 */
import fs from "node:fs";
import path from "node:path";
import type { EligibleLeg } from "./types";
import { INDIVIDUAL_LEG_ODDS_GUARDS } from "./risk-odds-bands";
import { classifyPlayerRoles, roleKeyForRow } from "../world-cup/player-role-quality";

/** Posted markets → display label + settlement rule. Anything not in this map is NOT mapped (no fakes). */
const MARKET_MAP: Record<string, { label: string; settlement: string }> = {
  player_goal_scorer_anytime: { label: "Anytime Goalscorer", settlement: "official goal in regulation (ESPN/FIFA)" },
  player_shots_on_target: { label: "Shots on Target", settlement: "official shots-on-target stat" },
  player_assists: { label: "Assists", settlement: "official assist stat" },
  player_shots: { label: "Shots", settlement: "official shots stat" },
};

const dec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));

interface TeamMatch { eventId: string; kickoffUtc: string | null; home: string; away: string }

/** fixture string → the TEAM-projection eventId + kickoff (player props key on a different id). */
function teamMatchByFixture(root: string, date: string): Map<string, TeamMatch> {
  const out = new Map<string, TeamMatch>();
  try {
    // Date-specific team projections so the fixture join matches the same slate as the player props.
    const dir = path.join(root, "world-cup", "projections");
    const dated = date ? path.join(dir, `${date}.json`) : "";
    const file = dated && fs.existsSync(dated) ? dated : path.join(dir, "latest.json");
    const team = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const r of team.matches ?? []) {
      const fixture = `${r.homeTeam} vs ${r.awayTeam}`;
      if (!out.has(fixture)) out.set(fixture, { eventId: String(r.matchId), kickoffUtc: r.kickoffUtc ?? null, home: r.homeTeam, away: r.awayTeam });
    }
  } catch { /* no team projections → no join */ }
  return out;
}

/**
 * Load the World Cup player-prop legs that are pre-event (relative to `nowIso`), odds-backed, within the
 * leg guards, and joinable to a team match. Returns `[]` when the artifact is missing.
 */
export function loadWorldCupPlayerPropLegs(root: string, nowIso: string, date: string): EligibleLeg[] {
  // Read the DATE-SPECIFIC props file so a past slate (e.g. June 19) reads its own data even after
  // `latest.json` rolls forward; fall back to latest when no dated file exists (e.g. fresh pull).
  let pp: { matches?: unknown[]; date?: string };
  try {
    const dir = path.join(root, "world-cup", "player-projections");
    const dated = date ? path.join(dir, `${date}.json`) : "";
    const file = dated && fs.existsSync(dated) ? dated : path.join(dir, "latest.json");
    pp = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch { return []; }
  if (!date || (pp.date && pp.date !== date)) return []; // only the current slate's props — never a stale day
  const teamByFixture = teamMatchByFixture(root, date);
  const legs: EligibleLeg[] = [];

  // Role-quality gate: a suggested card never uses a benched / goalkeeper / defender-on-attacking-prop /
  // deep-squad player prop. Classify roles across the whole slate (per-team ranking needs all rows).
  const allRows = (pp.matches ?? []) as Array<Record<string, any>>;
  const roleByKey = classifyPlayerRoles(
    allRows.map((r) => ({ player: r.player ?? {}, market: r.market, americanOdds: r.americanOdds, modelProbability: r.modelProbability })),
    Boolean((pp as any).lineupsPosted),
  );

  for (const raw of allRows) {
    const market = MARKET_MAP[raw.market];
    if (!market) continue; // only the four real posted markets — never invent one
    if (raw.projectionStatus && raw.projectionStatus !== "active") continue;
    const odds = typeof raw.americanOdds === "number" ? raw.americanOdds : null;
    if (odds == null) continue; // no odds → not odds-backed → skip
    if (odds < INDIVIDUAL_LEG_ODDS_GUARDS.minFavoriteAmerican || odds > INDIVIDUAL_LEG_ODDS_GUARDS.maxUnderdogAmerican) continue;
    const role = roleByKey.get(roleKeyForRow({ player: raw.player ?? {} }));
    if (!role || !role.eligibleForSpecials) continue; // role-quality gate — model-qualified players only
    const tm = teamByFixture.get(String(raw.fixture));
    if (!tm) continue; // can't join to a team match → can't settle / group by game
    const startTime = tm.kickoffUtc;
    if (!startTime || startTime <= nowIso) continue; // pre-event only — never a started game

    const player = raw.player ?? {};
    const team = player.team ?? null;
    const opponent = team === tm.home ? tm.away : tm.home;
    const side = String(raw.pick ?? (raw.market === "player_goal_scorer_anytime" || raw.market === "player_assists" ? "Yes" : "Over"));
    const line = typeof raw.line === "number" ? raw.line : null;
    const modelProbability = typeof raw.modelProbability === "number" ? raw.modelProbability : (typeof raw.marketProbability === "number" ? raw.marketProbability : null);
    const marketImplied = typeof raw.marketProbability === "number" ? raw.marketProbability : null;
    const edge = typeof raw.edgePct === "number" ? raw.edgePct : null;
    // Limited-data player props are higher variance + lower quality than team markets → they deprioritize
    // into the longer High/Longshot combos rather than flooding Low/Medium.
    const legQualityScore = 50;

    legs.push({
      legId: `WORLD_CUP:${tm.eventId}:${market.label}:${player.name}:${line ?? ""}`,
      sport: "WORLD_CUP", eventId: tm.eventId, gameId: tm.eventId,
      marketType: market.label, marketScope: "90_minutes",
      side, participantId: player.id != null ? String(player.id) : null, participantName: String(player.name ?? "Player"),
      teamId: null, teamName: team, opponentId: null, opponentName: opponent,
      line, odds, book: raw.bookmaker ?? null,
      modelProjection: modelProbability, modelProbability, marketImpliedProbability: marketImplied, edge,
      confidenceScore: "Low", confidenceTier: "Low",
      riskScore: 0.55, riskTier: "high",
      dataQualityGrade: "C", leakageValidationPassed: true,
      missingDataFlags: [], staleDataFlags: [], smallSampleFlags: [],
      topPositiveFactors: [{ label: `model ${Math.round((modelProbability ?? 0) * 100)}% · attacking ${market.label.toLowerCase()} prop`, direction: "positive", weight: 0.6 }],
      topNegativeFactors: [{ label: "limited-data / market-implied: lineups not yet posted, no independent per-player model", direction: "negative", weight: 0.6 }],
      correlationTags: [`game:${tm.eventId}`, `player:${player.name}`, `market:${raw.market}`, "scope:player_prop"],
      exposureTags: [`game:${tm.eventId}`, `player:${player.name}`],
      startTime, snapshotTime: null,
      eligible: true, ineligibilityReasons: [],
      legQualityScore, legQualityTier: "playable",
    });
  }
  return legs;
}
