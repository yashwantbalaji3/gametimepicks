/**
 * Card-factory diagnostics — for every card SCOPE × RISK bucket, report how the engine did: attempted,
 * passed, the target, the dominant rejection reason(s), and a public-friendly message. Empty buckets get
 * a REAL reason (never a vague "no qualified parlays"). Pure: computed from the already-built slate view,
 * so the matrix can't drift from what the explorer actually shows. No fabrication — when there is no
 * current slate, that is exactly what it says.
 */
import type { TodaySlateView, SportSlateStatus } from "@/lib/parlays/ui-loader";
import { RISK_BUCKETS, type RiskBucket, type CardScope, CARD_GENERATION_TARGETS } from "@/lib/parlays/risk-taxonomy";

export type RejectReason =
  | "no_current_slate" | "no_eligible_legs" | "gates_not_cleared" | "correlation_or_payout_band"
  | "sport_disabled_or_stale" | "no_current_slate_for_scope";

export interface DiagnosticCell {
  scope: CardScope;
  bucket: RiskBucket;
  attempted: number;
  passed: number;
  target: number;
  status: "ok" | "underfilled" | "empty";
  rejected: Partial<Record<RejectReason, number>>;
  message: string;
}
export interface CardFactoryDiagnostics {
  generatedAt: string;
  date: string;
  slatePresent: boolean;
  matrix: Record<CardScope, Record<RiskBucket, DiagnosticCell>>;
  summary: string;
}

const SCOPE_LABEL: Record<CardScope, string> = {
  world_cup_single_game: "World Cup single-game",
  world_cup_multi_game: "World Cup multi-game",
  mlb: "MLB",
  mixed: "Mixed-sport",
};

function reasonFor(status: SportSlateStatus | undefined, eligibleCount: number, passed: number): { reason: RejectReason; note: string } {
  if (eligibleCount === 0) {
    if (!status || status.extractorStatus === "source_missing") return { reason: "no_current_slate", note: status?.noQualified?.message ?? "no current slate" };
    return { reason: "no_eligible_legs", note: status.noQualified?.message ?? "no eligible legs today" };
  }
  if (passed === 0) return { reason: "gates_not_cleared", note: "no card cleared this bucket's payout band / leg count / correlation gates" };
  return { reason: "correlation_or_payout_band", note: "" };
}

function cell(scope: CardScope, bucket: RiskBucket, attempted: number, passed: number, status: SportSlateStatus | undefined): DiagnosticCell {
  const target = CARD_GENERATION_TARGETS[scope][bucket].target;
  const min = CARD_GENERATION_TARGETS[scope][bucket].min;
  const cellStatus: DiagnosticCell["status"] = passed === 0 ? "empty" : passed >= Math.max(min, target) ? "ok" : "underfilled";
  const rejected: Partial<Record<RejectReason, number>> = {};
  let message: string;
  if (passed === 0) {
    const { reason, note } = reasonFor(status, attempted, passed);
    rejected[reason] = Math.max(1, attempted || 1);
    message = reason === "no_current_slate"
      ? `No ${SCOPE_LABEL[scope]} ${bucketWord(bucket)} cards — no current slate (${note}).`
      : reason === "no_eligible_legs"
        ? `No ${SCOPE_LABEL[scope]} ${bucketWord(bucket)} cards — ${note}.`
        : `No ${SCOPE_LABEL[scope]} ${bucketWord(bucket)} card passed the gates today (${note}).`;
  } else {
    message = `${passed} ${SCOPE_LABEL[scope]} ${bucketWord(bucket)} card${passed === 1 ? "" : "s"} passed (target ${target}).`;
  }
  return { scope, bucket, attempted, passed, target, status: cellStatus, rejected, message };
}

const bucketWord = (b: RiskBucket) => (b === "longshot" ? "Longshot" : `${b[0].toUpperCase()}${b.slice(1)} Risk`);

export function buildCardFactoryDiagnostics(slate: TodaySlateView, generatedAt: string): CardFactoryDiagnostics {
  const date = slate.date;
  const wc = slate.sports.find((s) => s.sport === "WORLD_CUP");
  const mlb = slate.sports.find((s) => s.sport === "MLB");
  const wcEligible = wc?.eligibleCount ?? 0;
  const mlbEligible = mlb?.eligibleCount ?? 0;

  // Single-game WC: aggregate the game-specific cards by risk.
  const sgByRisk: Record<RiskBucket, number> = { low: 0, medium: 0, high: 0, longshot: 0 };
  for (const g of slate.gameSpecific.filter((x) => x.sport === "WORLD_CUP")) {
    for (const p of g.parlays) if (RISK_BUCKETS.includes(p.riskLevel as RiskBucket)) sgByRisk[p.riskLevel as RiskBucket]++;
  }
  const wcMulti = slate.suggestedBySportRisk["WORLD_CUP"] ?? {};
  const mlbByRisk = slate.suggestedBySportRisk["MLB"] ?? {};
  const mixed = slate.mixedByRisk ?? {};
  const mixedAttempt = Math.min(wcEligible || Infinity, mlbEligible || Infinity);
  const mixedAttempted = Number.isFinite(mixedAttempt) ? mixedAttempt : 0;

  // counts[b] may be a number (single-game aggregate) or an array of cards (suggestedByRisk/mixed).
  const num = (v: unknown) => (Array.isArray(v) ? v.length : typeof v === "number" ? v : 0);
  const mk = (scope: CardScope, counts: Record<string, unknown>, attempted: number, status: SportSlateStatus | undefined) =>
    Object.fromEntries(RISK_BUCKETS.map((b) => [b, cell(scope, b, attempted, num(counts[b]), status)])) as Record<RiskBucket, DiagnosticCell>;

  const matrix: Record<CardScope, Record<RiskBucket, DiagnosticCell>> = {
    world_cup_single_game: mk("world_cup_single_game", sgByRisk, wcEligible, wc),
    world_cup_multi_game: mk("world_cup_multi_game", wcMulti, wcEligible, wc),
    mlb: mk("mlb", mlbByRisk, mlbEligible, mlb),
    mixed: mk("mixed", mixed, mixedAttempted, (wcEligible === 0 ? wc : mlb)),
  };

  const slatePresent = wcEligible > 0 || mlbEligible > 0;
  const totalPassed = Object.values(matrix).reduce((s, scope) => s + Object.values(scope).reduce((a, c) => a + c.passed, 0), 0);
  const summary = slatePresent
    ? `${totalPassed} cards passed across all scopes for ${date}. Empty buckets list their gate / data reason below.`
    : `No current slate for ${date} — World Cup projections and the MLB board have not been generated yet, so every bucket is empty for a real reason (not a gate failure).`;

  return { generatedAt, date, slatePresent, matrix, summary };
}
