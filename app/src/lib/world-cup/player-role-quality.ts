/**
 * World Cup player ROLE-QUALITY gate. The June 19 Specials let any in-odds-range player prop into a
 * card — including deep-squad / rotation-risk shots props. This module screens each player by a
 * starter / role tier so that only role-confirmed or projected-starter / key-attacker props can enter
 * World Cup Specials. Bench, rotation-risk, defender-on-attacking-prop, goalkeeper, and unknown-role
 * players are excluded with an explicit reason.
 *
 * Honest by construction: when lineups are NOT posted (the common pre-event case) this NEVER claims a
 * confirmed starter — it labels roles as PROJECTED from real evidence only:
 *   • API-Football position (Attacker / Midfielder favoured; Goalkeeper + most Defenders excluded for
 *     attacking props),
 *   • market prominence — the book pricing the player as a scoring threat (a posted Anytime-Goalscorer
 *     market + a short-ish price = a likely first-choice attacker),
 *   • per-team ranking + a hard cap (≤5 eligible players per team).
 * No fabricated roles, lineups, minutes, or stats. Pure + deterministic.
 */

export type RoleTier =
  | "confirmed_starter"   // only when lineups are posted (not available pre-event)
  | "projected_starter"
  | "key_attacker"
  | "regular_rotation"
  | "bench_risk"
  | "unknown";

export type RoleExclusionReason =
  | "bench_role_risk"
  | "lineup_not_confirmed"
  | "player_not_projected_starter"
  | "low_usage_player"
  | "unsupported_role_source"
  | "market_exists_but_role_unclear";

export interface PlayerRoleQuality {
  playerKey: string;          // stable id (api-football id, else normalized name+team)
  playerName: string;
  teamName: string;
  position: string | null;
  roleTier: RoleTier;
  eligibleForSpecials: boolean;
  reason: string;             // human-readable; for excluded players starts with a RoleExclusionReason code
  evidence: string[];
  lineupsPosted: boolean;
}

/** Tiers that may enter World Cup Specials. */
export const ROLE_ELIGIBLE_TIERS: ReadonlySet<RoleTier> = new Set<RoleTier>([
  "confirmed_starter",
  "projected_starter",
  "key_attacker",
]);

/** Max eligible (key_attacker + projected_starter) players surfaced per team. */
export const MAX_ELIGIBLE_PER_TEAM = 5;
/** A player needs at least this prominence score to be projected as a starter/key attacker. */
const MIN_PROMINENCE = 0.4;

/** Minimal shape this gate needs from a player-prop row (feed-agnostic). */
export interface PropRowLike {
  player?: { id?: number | null; name?: string | null; team?: string | null; position?: string | null };
  market?: string | null;
  americanOdds?: number | null;
  modelProbability?: number | null;
}

const norm = (s: string | null | undefined): string =>
  (s ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const isAttacking = (pos: string | null): boolean => pos === "Attacker" || pos === "Midfielder";

interface Agg {
  id: number | null;
  name: string;
  team: string;
  position: string | null;
  hasGoalscorer: boolean;
  bestGoalscorerProb: number;
  bestAnyProb: number;
  shortestOdds: number | null; // most-favoured (lowest) american price seen
}

/** Prominence score — how strongly the market + position signal a first-choice attacking starter. */
function prominence(a: Agg): number {
  const base = a.hasGoalscorer ? Math.max(a.bestGoalscorerProb, a.bestAnyProb * 0.9) : a.bestAnyProb * 0.85;
  const posBonus = a.position === "Attacker" ? 0.06 : a.position === "Midfielder" ? 0.0 : -0.5;
  const scorerBonus = a.hasGoalscorer ? 0.08 : 0;
  return base + posBonus + scorerBonus;
}

/** True if the player's (or their last name's) normalized name is in the confirmed starting XI set. */
function inStartingXI(a: Agg, xi: ReadonlySet<string>): boolean {
  const n = norm(a.name);
  if (xi.has(n)) return true;
  const last = a.name.trim().split(/\s+/).slice(-1)[0];
  const ln = norm(last);
  for (const x of xi) if (x === n || x.endsWith(ln) || n.endsWith(x)) return true;
  return false;
}

/**
 * Classify every player in the prop feed into a role tier.
 * - `lineupsPosted` (from the feed) lets the top tier read `confirmed_starter` rather than projected.
 * - `confirmedStarters` (optional, normalized names from the official starting XI) is the HONEST
 *   lineup-aware upgrade: an attacking player IN the XI becomes `confirmed_starter`; one with posted
 *   props but NOT in the XI is `bench_risk` (excluded — they are benched). When omitted, roles stay
 *   projected/market-implied exactly as before (no fabricated confirmations).
 */
export function classifyPlayerRoles(
  rows: PropRowLike[],
  lineupsPosted = false,
  confirmedStarters?: ReadonlySet<string>,
  postedTeams?: ReadonlySet<string>,
): Map<string, PlayerRoleQuality> {
  const haveXI = !!confirmedStarters && confirmedStarters.size > 0;
  // 1) aggregate per player
  const aggByKey = new Map<string, Agg>();
  for (const r of rows) {
    const p = r.player ?? {};
    const name = p.name ?? null;
    const team = p.team ?? null;
    if (!name || !team) continue;
    const key = p.id != null ? `af:${p.id}` : `nm:${norm(name)}:${norm(team)}`;
    const prob = typeof r.modelProbability === "number" ? r.modelProbability : 0;
    const odds = typeof r.americanOdds === "number" ? r.americanOdds : null;
    const isGoalscorer = r.market === "player_goal_scorer_anytime";
    let a = aggByKey.get(key);
    if (!a) {
      a = { id: p.id ?? null, name, team, position: p.position ?? null, hasGoalscorer: false, bestGoalscorerProb: 0, bestAnyProb: 0, shortestOdds: null };
      aggByKey.set(key, a);
    }
    a.bestAnyProb = Math.max(a.bestAnyProb, prob);
    if (isGoalscorer) { a.hasGoalscorer = true; a.bestGoalscorerProb = Math.max(a.bestGoalscorerProb, prob); }
    if (odds != null) a.shortestOdds = a.shortestOdds == null ? odds : Math.min(a.shortestOdds, odds);
  }

  // 2) per-team ranking among attacking-eligible players
  const byTeam = new Map<string, Agg[]>();
  for (const a of aggByKey.values()) (byTeam.get(a.team) ?? byTeam.set(a.team, []).get(a.team)!).push(a);
  const rankByKey = new Map<string, { rank: number; total: number }>();
  for (const list of byTeam.values()) {
    const attacking = list.filter((a) => isAttacking(a.position))
      .sort((x, y) => prominence(y) - prominence(x) || (x.name < y.name ? -1 : 1));
    attacking.forEach((a, i) => rankByKey.set(keyOf(a), { rank: i, total: attacking.length }));
  }

  // 3) assign role tiers
  const out = new Map<string, PlayerRoleQuality>();
  for (const a of aggByKey.values()) {
    const key = keyOf(a);
    const score = prominence(a);
    // A player is "lineup-known" (confirmable / benchable) ONLY when THEIR team's XI is posted. With a
    // partial slate (e.g. one game's lineups posted, another's not) this keeps the un-posted game's
    // players projected instead of wrongly benching them. Without postedTeams (legacy callers) any
    // supplied XI applies to every team, preserving prior behavior.
    const teamPosted = haveXI && (!postedTeams || postedTeams.has(norm(a.team)));
    const lineupsKnown = lineupsPosted || teamPosted;
    // Display the shortest posted price as a prominence signal, but describe extreme-favourite prices
    // (shorter than the Specials leg floor) qualitatively — they never enter a card and an extreme raw
    // number reads like filler, so we keep evidence honest without printing it.
    const shortestLabel = a.shortestOdds == null ? "no posted price"
      : a.shortestOdds < -250 ? "shortest posted price: heavy market favourite (shorter than −250)"
      : `shortest posted price ${a.shortestOdds > 0 ? "+" : ""}${a.shortestOdds}`;
    const ev: string[] = [
      `position: ${a.position ?? "unknown"}`,
      a.hasGoalscorer ? `anytime-goalscorer market posted (model ${Math.round(a.bestGoalscorerProb * 100)}%)` : `no goalscorer market — shots-type prop only (model ${Math.round(a.bestAnyProb * 100)}%)`,
      shortestLabel,
    ];

    let roleTier: RoleTier;
    let reason = "";

    if (!a.position) {
      roleTier = "unknown";
      reason = "unsupported_role_source: no position from the identity feed (unmatched player)";
    } else if (a.position === "Goalkeeper") {
      roleTier = "bench_risk";
      reason = "bench_role_risk: goalkeeper — an attacking prop on a keeper is a novelty, not a role play";
    } else if (!isAttacking(a.position)) {
      // Defenders: not projected starters for ATTACKING props in Specials (role/rotation risk).
      roleTier = "regular_rotation";
      reason = "player_not_projected_starter: defender on an attacking prop — excluded from Specials";
    } else {
      const r = rankByKey.get(key) ?? { rank: 99, total: 0 };
      ev.push(`team attacking-prominence rank ${r.rank + 1}/${r.total}`);
      // Confirmed starting XI is the strongest, honest signal — it overrides market prominence.
      const inXI = teamPosted ? inStartingXI(a, confirmedStarters!) : null;
      if (inXI === false) {
        roleTier = "bench_risk";
        reason = "bench_role_risk: posted prop but NOT in the confirmed starting XI — benched";
      } else if (inXI === true) {
        roleTier = "confirmed_starter";
      } else if (score < MIN_PROMINENCE) {
        roleTier = "regular_rotation";
        reason = `low_usage_player: prominence ${score.toFixed(2)} below ${MIN_PROMINENCE} — deep-squad / rotation risk`;
      } else if (r.rank >= MAX_ELIGIBLE_PER_TEAM) {
        roleTier = "regular_rotation";
        reason = `low_usage_player: outside the top ${MAX_ELIGIBLE_PER_TEAM} attacking options for ${a.team}`;
      } else if (r.rank <= 1 && a.position === "Attacker" && a.hasGoalscorer) {
        roleTier = lineupsKnown ? "confirmed_starter" : "key_attacker";
      } else {
        roleTier = lineupsKnown ? "confirmed_starter" : "projected_starter";
      }
      if (ROLE_ELIGIBLE_TIERS.has(roleTier)) {
        ev.push(inXI === true ? "in the confirmed starting XI" : lineupsKnown ? "lineups posted → confirmed role" : "lineups not posted → projected role (market-implied)");
        reason = roleTier === "confirmed_starter"
          ? (inXI === true ? "named in the official starting XI" : "confirmed starter by posted lineups + prominence")
          : roleTier === "key_attacker"
            ? "top attacking option priced as a scoring threat (projected starter / key attacker)"
            : "projected starter / key attacker by market prominence + position";
      }
    }

    out.set(key, {
      playerKey: key,
      playerName: a.name,
      teamName: a.team,
      position: a.position,
      roleTier,
      eligibleForSpecials: ROLE_ELIGIBLE_TIERS.has(roleTier),
      reason,
      evidence: ev,
      lineupsPosted: lineupsKnown,
    });
  }
  return out;
}

function keyOf(a: Agg): string {
  return a.id != null ? `af:${a.id}` : `nm:${norm(a.name)}:${norm(a.team)}`;
}

/** The role-quality key for a prop row (matches `classifyPlayerRoles` map keys). */
export function roleKeyForRow(r: PropRowLike): string {
  const p = r.player ?? {};
  return p.id != null ? `af:${p.id}` : `nm:${norm(p.name)}:${norm(p.team)}`;
}
