/**
 * SPORTS EVENT-MARKET DISCOVERY classifier (Phase 11). A read-only classifier that decides whether a candidate market
 * is a long-horizon sports EVENT contract (player movement, trades, signings, retirement, coaching, awards, draft,
 * playoff qualification, tournament winner, roster selection) — and NOT an ordinary game moneyline (those belong to
 * the prop/game product, not event intelligence). Produces a normalized descriptor + a modelability read. No network,
 * no probability, deterministic.
 */
import type { EventCategory, ModelabilityDimensions } from "./modelability-contract";
import { scoreModelability } from "./modelability-contract";

export interface DiscoveryCandidate {
  question: string;
  sport?: string | null;
  league?: string | null;
  entities?: string[];
  outcomes?: { outcomeId: string; label: string; isResidual?: boolean }[];
  closesAt?: string | null;
  resolutionDeadline?: string | null;
  provider?: string;
  resolutionRules?: string | null;
}

export interface DiscoveryResult {
  isSportsEventMarket: boolean;
  category: EventCategory | "game_line" | "non_sports";
  reason: string;
  descriptor?: {
    sport: string | null; league: string | null; category: EventCategory; entities: string[];
    outcomes: { outcomeId: string; label: string; isResidual?: boolean }[];
    closesAt: string | null; resolutionDeadline: string | null; provider: string | null;
    modelability: ReturnType<typeof scoreModelability>["classification"];
    ruleClarity: number; evidenceRequirements: string[];
  };
}

// Category keyword signals (lowercase). Order matters: earlier categories win a tie.
const CATEGORY_SIGNALS: [EventCategory, RegExp][] = [
  ["award", /\b(mvp|most valuable|rookie of the year|cy young|dpoy|mip|coach of the year|ballon d'?or|award|finals mvp)\b/],
  ["draft_position", /\b(draft|no\.?\s?\d+ pick|first overall|drafted|lottery pick)\b/],
  ["qualification", /\b(make the playoffs|playoff|qualif|promotion|relegation|clinch|seed|advance to)\b/],
  ["tournament_winner", /\b(win the|champion|championship|title|world series|super bowl|stanley cup|the finals|tournament winner|cup winner)\b/],
  ["player_movement", /\b(next team|sign(s|ed)?( with| the| a)?|traded|be traded|land with|join(s)?\b|transfer to|acquire|free agent)\b/],
  ["personnel", /\b(head coach|fired|hired|be the next (coach|manager|gm)|manager|coaching change|sacked)\b/],
  ["retirement", /\b(retire|retirement|announce retirement)\b/],
];

// Ordinary single-game betting line — NOT event intelligence.
const GAME_LINE = /\b(moneyline|to win (tonight|today|the game)|beat the|vs\.?|spread|run line|over\/under|total (runs|points|goals) in|first to score)\b/;
const NON_SPORTS = /\b(election|inflation|fed rate|weather|temperature|gdp|bitcoin|stock|oscar|grammy|box office)\b/;

const EVIDENCE_BY_CATEGORY: Record<EventCategory, string[]> = {
  award: ["voting/ballot history", "candidate statistical case", "official award criteria"],
  qualification: ["current standings", "remaining schedule", "tiebreaker rules"],
  tournament_winner: ["bracket/standings", "form + roster health", "historical base rates"],
  draft_position: ["team needs + board reporting", "combine/measurements", "trade chatter (timed)"],
  player_movement: ["cap/contract situation", "official transaction feed", "tier1 reporter timeline"],
  personnel: ["official team statements", "tier1 reporter timeline", "buyout/contract status"],
  retirement: ["player/agent statements", "official announcements"],
  other: ["contract resolution rules", "relevant timed reporting"],
};

export function classifyMarket(c: DiscoveryCandidate): DiscoveryResult {
  const q = (c.question || "").toLowerCase();
  if (!q.trim()) return { isSportsEventMarket: false, category: "non_sports", reason: "empty question" };
  if (NON_SPORTS.test(q)) return { isSportsEventMarket: false, category: "non_sports", reason: "matches a non-sports topic" };

  const catHit = CATEGORY_SIGNALS.find(([, re]) => re.test(q));
  // an ordinary game line is excluded UNLESS it also clearly matches a long-horizon event category
  if (GAME_LINE.test(q) && !catHit) return { isSportsEventMarket: false, category: "game_line", reason: "ordinary single-game betting line — not long-horizon event intelligence" };
  if (!catHit) return { isSportsEventMarket: false, category: "non_sports", reason: "no long-horizon sports-event category matched" };

  const category = catHit[0];
  const outcomes = c.outcomes ?? [];
  // Only OVERRIDE a dimension when the candidate actually gives us signal for it — otherwise let the category prior
  // apply. (A discovered market that hasn't captured its resolution rules yet must not be forced to UNSUPPORTED; a
  // rules-less personnel/coaching market should still read INFORMATION_ONLY from its insider-driven prior.)
  const dims: ModelabilityDimensions = {};
  if (c.resolutionRules) dims.ruleClarity = c.resolutionRules.length > 30 ? 4 : 2;
  if (outcomes.length > 0) { dims.outcomeClarity = 4; dims.outcomeExhaustiveness = outcomes.some((o) => o.isResidual) ? 5 : outcomes.length >= 2 ? 3 : 2; }
  const modelability = scoreModelability({ category, dimensions: dims }).classification;
  const ruleClarity = dims.ruleClarity ?? 0; // 0 = rules not yet captured (reported honestly)

  return {
    isSportsEventMarket: true,
    category,
    reason: `matched ${category} signal`,
    descriptor: {
      sport: c.sport ?? null, league: c.league ?? null, category, entities: c.entities ?? [],
      outcomes, closesAt: c.closesAt ?? null, resolutionDeadline: c.resolutionDeadline ?? null, provider: c.provider ?? null,
      modelability, ruleClarity, evidenceRequirements: EVIDENCE_BY_CATEGORY[category],
    },
  };
}

/** Dedupe cross-provider candidates that are the same market (normalized question + entity set), keeping the first. */
export function dedupeCandidates<T extends DiscoveryCandidate>(candidates: T[]): T[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of candidates) {
    const key = `${norm(c.question)}::${[...(c.entities ?? [])].map((e) => e.toLowerCase()).sort().join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key); out.push(c);
  }
  return out;
}
