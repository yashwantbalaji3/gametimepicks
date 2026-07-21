/**
 * Suggested-parlay COVERAGE MATRIX — the single source of truth for the Parlay Lab / Picks top table.
 * Extends the card-factory diagnostics (World Cup single-game / multi-game / MLB / Mixed) with two more
 * scopes — Moonshot and Core Bank Builder — and adds row totals, per-risk totals, and a grand total.
 *
 * Active Bank Builder + Moonshot cards live in their OWN rows; they are NOT counted inside the generic
 * WC/MLB/Mixed suggestions (those are independently model-generated cards), so nothing is double-counted.
 * Pure + deterministic — computed from the already-built slate + moonshot artifacts. No fabrication:
 * an empty cell always carries a real reason.
 */
import type { TodaySlateView } from "@/lib/parlays/ui-loader";
import type { MoonshotLane } from "@/lib/moonshot/moonshot-lane";
import { activeMoonshotCard } from "@/lib/moonshot/moonshot-lane";
import { buildCardFactoryDiagnostics } from "@/lib/parlays/card-factory-diagnostics";
import { getRiskBucketForCombinedOdds } from "@/lib/parlays/risk-odds-bands";
import { RISK_BUCKETS, RISK_LABELS, type RiskBucket } from "@/lib/parlays/risk-taxonomy";
import { RISK_BUCKET_TARGETS } from "@/lib/parlays/risk-bucket-targets";

export type ScopeKey =
  | "world_cup_single_game" | "world_cup_multi_game" | "mlb" | "mixed" | "moonshot" | "bank_builder";

export interface CoverageCell {
  scope: ScopeKey;
  risk: RiskBucket;
  label: string; // canonical "Low Risk" | "Medium Risk" | "High Risk" | "Longshot"
  count: number;
  target: number;
  min: number;
  status: "filled" | "underfilled" | "empty";
  topReasons: string[];
  message: string;
}
export interface CoverageRow {
  scope: ScopeKey;
  displayName: string;
  href: string;
  cells: CoverageCell[];
  total: number;
}
export interface BalancedGeneration {
  targets: Record<ScopeKey, Record<RiskBucket, number>>;
  filledByScopeRisk: Record<string, number>; // "scope.risk" → count
  underfilledReasons: Record<string, string>; // "scope.risk" → reason for empty/under-target buckets
  capPerBucket: number;
}
export interface CoverageMatrix {
  generatedAt: string;
  date: string;
  rows: CoverageRow[];
  riskTotals: Record<RiskBucket, number>;
  grandTotal: number;
  diagnosticsSummary: string[];
  balancedGeneration: BalancedGeneration;
}

const SCOPE_META: Record<ScopeKey, { name: string; href: string }> = {
  world_cup_single_game: { name: "World Cup Games", href: "/world-cup" },
  world_cup_multi_game: { name: "World Cup Multi-Game", href: "/parlays?sport=world_cup" },
  mlb: { name: "MLB", href: "/picks?sport=mlb" },
  mixed: { name: "Mixed Sport", href: "/parlays?sport=mixed" },
  moonshot: { name: "Moonshot", href: "/bank-builder#moonshot" },
  bank_builder: { name: "Core Bank Builder", href: "/bank-builder" },
};

/** Active-card scopes have a simple "1 if placed" target — they are operator-placed, not model-fanned. */
const ACTIVE_SCOPE_NOTE = "Active card tracked separately — not promoted as a generic suggestion (no double-count).";

export function buildCoverageMatrix(slate: TodaySlateView, moonshot: MoonshotLane | null, generatedAt: string): CoverageMatrix {
  const diag = buildCardFactoryDiagnostics(slate, generatedAt);
  const rows: CoverageRow[] = [];

  // 1-4: the model-generated scopes from the card-factory diagnostics. The 2026 World Cup is COMPLETE — its
  // scopes are archived, so an EMPTY World Cup scope row is omitted entirely (WC is not a current coverage
  // category). MLB/Mixed always show. If a future World Cup ever produces cards again, its row returns.
  for (const scope of ["world_cup_single_game", "world_cup_multi_game", "mlb", "mixed"] as const) {
    const cells: CoverageCell[] = RISK_BUCKETS.map((risk) => {
      const c = diag.matrix[scope][risk];
      return {
        scope, risk, label: RISK_LABELS[risk],
        count: c.passed, target: c.target, min: 0,
        status: c.status === "ok" ? "filled" : c.status,
        topReasons: c.passed === 0 ? Object.keys(c.rejected) : [],
        message: c.message,
      };
    });
    const total = cells.reduce((n, c) => n + c.count, 0);
    const isWorldCup = scope === "world_cup_single_game" || scope === "world_cup_multi_game";
    if (isWorldCup && total === 0) continue; // completed World Cup → no empty coverage row
    rows.push({ scope, displayName: SCOPE_META[scope].name, href: SCOPE_META[scope].href, cells, total });
  }

  // 5: Moonshot — count the active Moonshot card in its risk bucket (Longshot). Own row, no double-count.
  rows.push(activeRow("moonshot", moonshotActiveByRisk(moonshot),
    moonshot ? (activeMoonshotCard(moonshot) ? "Active high-volatility Moonshot card (separate lane)." : "Moonshot Lane awaiting a qualified card.") : "No Moonshot lane."));

  // 6: Core Bank Builder — Lane A + Lane B active cards, each in the bucket its combined odds fit.
  rows.push(activeRow("bank_builder", bankBuilderActiveByRisk(slate), ACTIVE_SCOPE_NOTE));

  const riskTotals = Object.fromEntries(RISK_BUCKETS.map((r) => [r, rows.reduce((n, row) => n + (row.cells.find((c) => c.risk === r)?.count ?? 0), 0)])) as Record<RiskBucket, number>;
  const grandTotal = rows.reduce((n, r) => n + r.total, 0);

  const diagnosticsSummary = [
    diag.summary,
    riskTotals.low === 0 ? "No Low Risk card anywhere: a 2+-leg parlay rarely prices into -200..+100 after removing extreme-favorite filler (< -500). Honest empty, not a gate failure." : "",
    `Moonshot + Core Bank Builder are counted in their own rows only — never inside the generic WC/MLB/Mixed suggestions, so no card is double-counted.`,
  ].filter(Boolean);

  // Balanced-generation report: target vs filled per scope×risk, with a reason for every under-target bucket.
  const filledByScopeRisk: Record<string, number> = {};
  const underfilledReasons: Record<string, string> = {};
  for (const row of rows) {
    for (const c of row.cells) {
      const k = `${c.scope}.${c.risk}`;
      filledByScopeRisk[k] = c.count;
      const target = RISK_BUCKET_TARGETS[c.scope][c.risk];
      if (c.count < target) underfilledReasons[k] = c.count === 0 ? c.message : `${c.count}/${target} — capped or limited eligible cards`;
    }
  }
  const balancedGeneration: BalancedGeneration = { targets: RISK_BUCKET_TARGETS, filledByScopeRisk, underfilledReasons, capPerBucket: 5 };

  return { generatedAt, date: slate.date, rows, riskTotals, grandTotal, diagnosticsSummary, balancedGeneration };
}

function activeRow(scope: ScopeKey, byRisk: Record<RiskBucket, number>, note: string): CoverageRow {
  const cells: CoverageCell[] = RISK_BUCKETS.map((risk) => ({
    scope, risk, label: RISK_LABELS[risk],
    count: byRisk[risk], target: 0, min: 0,
    status: byRisk[risk] > 0 ? "filled" : "empty",
    topReasons: byRisk[risk] === 0 ? ["active_card_tracked_separately"] : [],
    message: byRisk[risk] > 0 ? `${byRisk[risk]} active card${byRisk[risk] === 1 ? "" : "s"} in this bucket.` : note,
  }));
  return { scope, displayName: SCOPE_META[scope].name, href: SCOPE_META[scope].href, cells, total: cells.reduce((n, c) => n + c.count, 0) };
}

function emptyByRisk(): Record<RiskBucket, number> {
  return { low: 0, medium: 0, high: 0, longshot: 0 };
}

function moonshotActiveByRisk(lane: MoonshotLane | null): Record<RiskBucket, number> {
  const out = emptyByRisk();
  const card = activeMoonshotCard(lane);
  if (card) out.longshot += 1; // Moonshot cards are Longshot by design
  return out;
}

function bankBuilderActiveByRisk(slate: TodaySlateView): Record<RiskBucket, number> {
  const out = emptyByRisk();
  const bb = slate.bankBuilderPreview;
  for (const lane of [bb?.laneA, bb?.laneB]) {
    if (!lane || lane.publicVisible === false) continue;
    // The active step's card combined odds → its bucket. Only count a live (not awaiting/stopped) card.
    const active = (lane.steps ?? []).find((s: { status?: string }) => s.status === "pending" || s.status === "active");
    const odds = active?.combinedOdds ?? (lane as { combinedOdds?: number | null }).combinedOdds;
    if (odds == null) continue;
    const bucket = getRiskBucketForCombinedOdds(odds);
    if (bucket) out[bucket] += 1;
  }
  return out;
}
