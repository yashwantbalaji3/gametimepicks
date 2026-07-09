/**
 * results-trust-center.ts — the single canonical assembler for the
 * `/results` Trust Center (Chunk 6B).
 *
 * WHY THIS FILE EXISTS: `/results` is the public trust surface. Every
 * number it shows — official record, bankroll, crown, drawdown,
 * open exposure, settlement status, MLB model-performance — is resolved
 * HERE from committed canonical artifacts, then handed to presentational
 * components as plain props. The UI never re-reads JSON and never carries
 * a hardcoded money literal, so a component can't fabricate or drift.
 *
 * HONESTY CONTRACT (mirrors the money gates):
 *   - Official product-card record (19-14) comes from
 *     `mr-dub/portfolio.json` `record` — the same file the money-integrity
 *     gate hashes. It is the ONLY "record" this page treats as the record.
 *   - Raw MLB model-performance (`public/data/mlb/results/*`) is a
 *     SEPARATE, money-independent ledger. It is surfaced under its own
 *     section with an explicit "not part of the 19-14 record" disclaimer.
 *     The two are never summed or conflated.
 *   - Pending is not loss. Awaiting-next-card is not a pending settlement.
 *   - Nothing is fabricated: a missing source yields null → the UI renders
 *     an honest unavailable state.
 *
 * READ-ONLY: this module never writes; it only reads committed JSON.
 */
import fs from "node:fs";
import path from "node:path";

import {
  getMlbLifetimeSummary,
  getMlbComparisonReport,
  latestMlbResultDate,
} from "./data-mlb-results";
import { getBankBuilderSettledSteps } from "./bank-builder-results";

const MR_DUB_DIR = path.join(process.cwd(), "public", "data", "mr-dub");

function readMrDub<T>(rel: string): T | null {
  try {
    const p = path.join(MR_DUB_DIR, rel);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
  } catch (err) {
    console.warn(`[results-trust-center] could not load ${rel}:`, err);
    return null;
  }
}

export interface TrustRecord {
  wins: number;
  losses: number;
  voids: number;
  pending: number;
}

export interface TrustMoney {
  record: TrustRecord;
  bankroll: number;
  crown: number;
  profit: number;
  drawdown: number;
  drawdownPct: number | null;
  roi: number | null;
  startingBankroll: number | null;
  startingDate: string | null;
  highWaterMark: number | null;
  openExposure: number;
  openExposurePct: number | null;
  generatedAt: string | null;
}

export interface TrustCompletedCard {
  name: string;
  result: string;
  start: number | null;
  final: number | null;
  official: boolean;
}

export interface TrustAwaitingCard {
  laneId: string;
  step: number | null;
  kind: string;
  note: string;
}

export interface TrustSettlement {
  status: string;
  realizedPnl: number;
  date: string | null;
  generatedAt: string | null;
}

export interface TrustMoonshot {
  label: string;
  status: string;
  record: TrustRecord;
  currentStep: number | null;
  targetReturn: number | null;
  exposure: number;
}

export interface TrustBankrollHealth {
  score: number | null;
  label: string;
  reasons: string[];
}

export interface TrustMlbMarket {
  key: string;
  label: string;
  total: number;
  hitRate: number | null;
}

export interface TrustMlbPerformance {
  latestDate: string | null;
  daily: {
    decisive: number;
    wins: number;
    losses: number;
    hitRate: number | null;
  } | null;
  lifetime: {
    totalDates: number;
    decisive: number;
    wins: number;
    losses: number;
    hitRate: number | null;
    newestDate: string | null;
  } | null;
  byMarket: TrustMlbMarket[];
}

export interface TrustCenterModel {
  money: TrustMoney | null;
  completedCards: TrustCompletedCard[];
  awaitingCards: TrustAwaitingCard[];
  activeCardsCount: number;
  settledBankBuilderStepCount: number;
  settlement: TrustSettlement | null;
  moonshot: TrustMoonshot | null;
  bankrollHealth: TrustBankrollHealth | null;
  mlb: TrustMlbPerformance;
}

/** Friendly labels + stable display order for the MLB prop markets. */
const MLB_MARKET_LABELS: Record<string, string> = {
  pitcher_strikeouts: "Strikeouts",
  batter_hits: "Hits",
  batter_hits_runs_rbis: "H+R+RBI",
  batter_total_bases: "Total bases",
};
const MLB_MARKET_ORDER = [
  "pitcher_strikeouts",
  "batter_hits",
  "batter_hits_runs_rbis",
  "batter_total_bases",
];

function toRecord(r: unknown): TrustRecord {
  const o = (r ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    wins: n(o.wins),
    losses: n(o.losses),
    voids: n(o.voids),
    pending: n(o.pending),
  };
}

/** Assemble the full Trust Center view-model from canonical artifacts. */
export function getTrustCenterModel(): TrustCenterModel {
  const portfolio = readMrDub<Record<string, unknown>>("portfolio.json");
  const daily = readMrDub<Record<string, unknown>>("daily-portfolio.json");

  const money: TrustMoney | null = portfolio
    ? {
        record: toRecord(portfolio.record),
        bankroll: Number(portfolio.currentBankroll ?? 0),
        crown: Number(portfolio.crownBankroll ?? 0),
        profit: Number(portfolio.settledProfit ?? 0),
        drawdown: Number(portfolio.drawdown ?? 0),
        drawdownPct:
          typeof portfolio.drawdownPct === "number" ? portfolio.drawdownPct : null,
        roi: typeof portfolio.roi === "number" ? portfolio.roi : null,
        startingBankroll:
          typeof portfolio.startingBankroll === "number"
            ? portfolio.startingBankroll
            : null,
        startingDate:
          typeof portfolio.startingDate === "string" ? portfolio.startingDate : null,
        highWaterMark:
          typeof portfolio.highWaterMark === "number"
            ? portfolio.highWaterMark
            : null,
        openExposure: Number(
          portfolio.totalOpenExposure ?? portfolio.openExposure ?? 0,
        ),
        openExposurePct:
          typeof portfolio.openExposurePct === "number"
            ? portfolio.openExposurePct
            : null,
        generatedAt:
          typeof portfolio.generatedAt === "string" ? portfolio.generatedAt : null,
      }
    : null;

  const completedCards: TrustCompletedCard[] = Array.isArray(portfolio?.completedCards)
    ? (portfolio!.completedCards as Record<string, unknown>[]).map((c) => ({
        name: String(c.name ?? "Ladder"),
        result: String(c.result ?? ""),
        start: typeof c.start === "number" ? c.start : null,
        final: typeof c.final === "number" ? c.final : null,
        official: c.official === true,
      }))
    : [];

  const awaitingCards: TrustAwaitingCard[] = Array.isArray(portfolio?.awaitingCards)
    ? (portfolio!.awaitingCards as Record<string, unknown>[]).map((c) => ({
        laneId: String(c.laneId ?? ""),
        step: typeof c.step === "number" ? c.step : null,
        kind: String(c.kind ?? "awaiting_next_card"),
        note: String(c.note ?? ""),
      }))
    : [];

  const activeCardsCount = Array.isArray(portfolio?.activeCards)
    ? (portfolio!.activeCards as unknown[]).length
    : 0;

  const settlement: TrustSettlement | null = daily
    ? {
        status: String(
          (daily.settlement as Record<string, unknown> | undefined)?.status ?? "none",
        ),
        realizedPnl: Number(
          (daily.settlement as Record<string, unknown> | undefined)?.realizedPnl ?? 0,
        ),
        date: typeof daily.date === "string" ? daily.date : null,
        generatedAt:
          typeof daily.generatedAt === "string" ? daily.generatedAt : null,
      }
    : null;

  const rawMoonshot = portfolio?.moonshot as Record<string, unknown> | undefined;
  const moonshot: TrustMoonshot | null = rawMoonshot
    ? {
        label: String(rawMoonshot.lane ?? "Moonshot Lane"),
        status: String(rawMoonshot.status ?? "stopped"),
        record: toRecord(rawMoonshot.record),
        currentStep:
          typeof rawMoonshot.currentStep === "number"
            ? rawMoonshot.currentStep
            : null,
        targetReturn:
          typeof rawMoonshot.targetReturn === "number"
            ? rawMoonshot.targetReturn
            : null,
        exposure: Number(rawMoonshot.exposure ?? 0),
      }
    : null;

  const rawHealth = portfolio?.bankrollHealth as Record<string, unknown> | undefined;
  const bankrollHealth: TrustBankrollHealth | null = rawHealth
    ? {
        score: typeof rawHealth.score === "number" ? rawHealth.score : null,
        label: String(rawHealth.label ?? ""),
        reasons: Array.isArray(rawHealth.reasons)
          ? (rawHealth.reasons as unknown[]).map((r) => String(r))
          : [],
      }
    : null;

  // Count of BB steps that have officially settled — the settled-card evidence.
  const settledBankBuilderStepCount = getBankBuilderSettledSteps().length;

  // ── Raw MLB model-performance (money-INDEPENDENT ledger) ──────────────
  const latestDate = latestMlbResultDate();
  const lifetimeSummary = getMlbLifetimeSummary();
  const report = latestDate ? getMlbComparisonReport(latestDate) : null;

  const byMarket: TrustMlbMarket[] = report?.byMarket
    ? MLB_MARKET_ORDER.filter((k) => report.byMarket[k]).map((k) => {
        const b = report.byMarket[k];
        return {
          key: k,
          label: MLB_MARKET_LABELS[k] ?? k,
          total: b.total,
          hitRate: b.hitRate,
        };
      })
    : [];

  const mlb: TrustMlbPerformance = {
    latestDate,
    daily: report
      ? {
          decisive: report.decisive,
          wins: report.wins,
          losses: report.losses,
          hitRate: report.hitRate,
        }
      : null,
    lifetime: lifetimeSummary
      ? {
          totalDates: lifetimeSummary.totalDates,
          decisive: lifetimeSummary.decisive,
          wins: lifetimeSummary.wins,
          losses: lifetimeSummary.losses,
          hitRate: lifetimeSummary.hitRate,
          newestDate: lifetimeSummary.newestDate,
        }
      : null,
    byMarket,
  };

  return {
    money,
    completedCards,
    awaitingCards,
    activeCardsCount,
    settledBankBuilderStepCount,
    settlement,
    moonshot,
    bankrollHealth,
    mlb,
  };
}
