/**
 * Mr. Dub FLAGSHIP model — the derived view layer for the premium portfolio page. It transforms the
 * CANONICAL settlement artifacts (portfolio.json, daily-summary.json, master-ledger, banked-ladders,
 * moonshot) into everything the flagship UI renders: an enriched day-by-day timeline, executive KPIs,
 * chart series, product attribution, and the Bank Builder journey.
 *
 * HARD CONTRACT — this module NEVER fabricates or mutates money. Every figure is read from a settled
 * canonical source. The one place that could "invent" data — the running cumulative record — instead
 * RECONCILES to portfolio.json's official record (17–10) by expanding the aggregated dual-lane loss event
 * into its constituent $100 seeds and attributing the officially-banked dual-lane wins (from
 * banked-ladders' historicalRecord) to the dual-lane phase window. No dates or results are invented; a
 * unit test pins `final cumulative === portfolio.record`.
 */

import fs from "node:fs";
import path from "node:path";
import { buildMasterLedger } from "./master-ledger";
import { computeOpenExposure } from "./open-exposure";

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

// ── Canonical input shapes (only the fields we read) ──────────────────────────────────────────────
export interface FlagshipLeg {
  selection?: string; side?: string | null; line?: number | null; market?: string | null;
  result?: string; officialResult?: string | null; finalScore?: string | null; finalStat?: number | null;
  source?: string; sport?: string;
}
export interface FlagshipEvent {
  eventId?: string; category?: string; type?: string; laneId?: string; step?: number | null; date?: string;
  sport?: string; paperStake?: number; paperReturn?: number; paperProfit?: number; bankrollAfter?: number;
  combinedAmerican?: number | null; combinedOdds?: number | null; status?: string; result?: string;
  rolled?: boolean; officialResultConfirmed?: boolean; settlementSource?: string; publicBankBuilderVisible?: boolean;
  legs?: FlagshipLeg[]; notes?: string; accountingNote?: string; projectedReturn?: number; atRiskStake?: number;
}
export interface DailyDay {
  date: string; staked: number; returned: number; pl: number;
  wins: number; losses: number; voids: number; pending: number;
  events: FlagshipEvent[]; opening: number; closing: number;
}
export interface PortfolioDoc {
  startingDate?: string; startingBankroll?: number; crownBankroll?: number; currentBankroll?: number;
  openExposure?: number; settledProfit?: number; roi?: number; roiMultiple?: number;
  record?: { wins: number; losses: number; voids?: number; pending?: number };
  highWaterMark?: number; drawdown?: number; drawdownPct?: number; generatedAt?: string;
  intelligence?: { longestWinStreak?: number; longestLossStreak?: number; winRate?: number; avgStake?: number; profitFactor?: number | null };
  moonshot?: any;
}

// ── Output shapes ─────────────────────────────────────────────────────────────────────────────────
export type DaySign = "win" | "loss" | "flat";
export interface TimelineDay {
  date: string;
  opening: number; closing: number; pl: number; plPct: number; sign: DaySign;
  dayWins: number; dayLosses: number;            // that day's dated settlements (aggregates expanded)
  cumWins: number; cumLosses: number;            // running cumulative — reconciles to canonical on the last day
  roiMultiple: number;                            // cumulative (closing − start) / start
  hwm: number; drawdown: number; drawdownPct: number;
  products: string[];                             // product codes that settled that day
  ladderLabel: string | null; ladderStep: number | null;
  settledCount: number; pendingCount: number;
  bankBuilderResult: "won" | "lost" | "mixed" | "flat" | null;
  headline: string;                               // one-line human summary
  events: FlagshipEvent[];
  bankedNote: string | null;                      // set only on the day carrying the banked dual-lane residual
}
export interface FlagshipKpis {
  record: { wins: number; losses: number };
  bankroll: number; peak: number; profit: number; roiMultiple: number; roiPct: number;
  drawdown: number; drawdownPct: number;
  largestWinDay: { date: string; pl: number } | null;
  largestLossDay: { date: string; pl: number } | null;
  longestWinStreak: number; longestLossStreak: number;
  winRate: number; avgStake: number; profitFactor: number | null;
  startingBankroll: number; startingDate: string;
  settledDays: number; winDays: number; lossDays: number;
  currentDate: string;
}
export interface ProductPerf {
  productId: string; label: string; glyph: string;
  wins: number; losses: number; bets: number; profit: number; winRate: number;
  net: "positive" | "negative" | "flat"; canonical: boolean;
}
export interface FlagshipCharts {
  bankroll: { date: string; closing: number }[];
  dailyRoi: { date: string; pl: number; plPct: number }[];
  drawdown: { date: string; drawdown: number; drawdownPct: number }[];
  productPerformance: ProductPerf[];
  heatmap: { date: string; pl: number; sign: DaySign }[];
}
export interface JourneyStep { step: number; before: number; after: number; result: string; date: string | null; legs: string[]; profit: number }
export interface JourneyLadder { ladder: number; label: string; start: number; final: number; completedDate: string | null; result: string; steps: JourneyStep[] }
export interface JourneyActiveLeg { selection: string; odds: number | null; marketLabel?: string; matchup?: string | null }
export interface JourneyActiveLane { lane: string; kind: string; label: string; step: number; clearedSteps: number; stake: number; potentialReturn: number | null; combinedOdds: number | null; confidence: string | null; legs: JourneyActiveLeg[]; whyLadderPick?: string | null }
export interface BankBuilderJourney { crownTotal: number; ladders: JourneyLadder[]; activeLanes: JourneyActiveLane[]; activeAsOf: string | null }
export interface WagerRow { date: string; productId: string; productLabel: string; glyph: string; outcome: "won" | "lost" | "void"; stake: number; payout: number; profit: number; canonical: boolean; detail: string | null }

export interface Flagship {
  kpis: FlagshipKpis;
  timeline: TimelineDay[];          // newest first
  charts: FlagshipCharts;
  journey: BankBuilderJourney;
  wagers: WagerRow[];               // newest first — for product attribution / filtering
}

// ── Product metadata ──────────────────────────────────────────────────────────────────────────────
export const PRODUCT_META: Record<string, { code: string; glyph: string; label: string }> = {
  bank_builder: { code: "BB", glyph: "🏦", label: "Bank Builder" },
  "bank-builder": { code: "BB", glyph: "🏦", label: "Bank Builder" },
  moonshot: { code: "MS", glyph: "🌙", label: "Moonshot" },
  "wc-specials": { code: "WC", glyph: "⚽", label: "World Cup Specials" },
  wc_specials: { code: "WC", glyph: "⚽", label: "World Cup Specials" },
  "homer-nukes": { code: "HR", glyph: "⚾", label: "Homer Nukes" },
  homer_nukes: { code: "HR", glyph: "⚾", label: "Homer Nukes" },
};

function sign(pl: number): DaySign { return pl > 0.009 ? "win" : pl < -0.009 ? "loss" : "flat"; }

/** How many $100 seeds an aggregated dual-lane-loss event represents (its |P/L| ÷ 100, min 1). */
function seedsOf(e: FlagshipEvent): number {
  return Math.max(1, Math.round(Math.abs(e.paperProfit ?? 0) / 100));
}

/**
 * Enriched day-by-day timeline + the executive KPIs that depend on it. PURE — a function of the canonical
 * daily-summary days + portfolio doc. The running cumulative record is reconciled to `portfolio.record`
 * so the last row reads the official 17–10 (see module header).
 */
export function buildTimeline(days: DailyDay[], portfolio: PortfolioDoc): { timeline: TimelineDay[]; kpis: FlagshipKpis } {
  const start = Number(portfolio.startingBankroll ?? 100) || 100;
  const startingDate = portfolio.startingDate ?? (days[0]?.date ?? "2026-06-09");
  const sorted = [...(days ?? [])].sort((a, b) => a.date.localeCompare(b.date));

  // Per-day dated settlement deltas (expand aggregated dual-lane loss events into their seed count).
  const perDay = sorted.map((d) => {
    let w = 0, l = 0;
    for (const e of d.events ?? []) {
      const r = e.result;
      const isAggregate = e.type === "dual_lane_losses";
      if (isAggregate) { l += seedsOf(e); continue; }
      if (r === "won" || r === "win") w++;
      else if (r === "lost") l++;
    }
    return { date: d.date, w, l };
  });
  const datedW = perDay.reduce((s, x) => s + x.w, 0);
  const datedL = perDay.reduce((s, x) => s + x.l, 0);

  // Reconcile to the canonical record. The residual wins are the officially-banked dual-lane rungs that
  // the artifact aggregated (they live in banked-ladders' historicalRecord); attribute them to the FIRST
  // day that carries a dual-lane-phase loss so the running total lands exactly on the official record.
  const canonW = Number(portfolio.record?.wins ?? datedW);
  const canonL = Number(portfolio.record?.losses ?? datedL);
  const residualW = Math.max(0, canonW - datedW);
  const residualL = Math.max(0, canonL - datedL);
  const bankIdx = sorted.findIndex((d) => (d.events ?? []).some((e) => e.type === "dual_lane_losses"));
  const bankDate = bankIdx >= 0 ? sorted[bankIdx].date : null;

  let running = start, hwm = start, maxDrawdown = 0;
  let cumW = 0, cumL = 0;
  const timeline: TimelineDay[] = sorted.map((d, i) => {
    const opening = round2(d.opening ?? running);
    const closing = round2(d.closing ?? round2(opening + d.pl));
    running = closing;
    hwm = Math.max(hwm, closing);
    const drawdown = round2(hwm - closing);
    maxDrawdown = Math.max(maxDrawdown, drawdown);
    let dayW = perDay[i].w, dayL = perDay[i].l;
    if (d.date === bankDate) { dayW += residualW; dayL += residualL; }
    cumW += dayW; cumL += dayL;

    const bbEvents = (d.events ?? []).filter((e) => (e.category ?? "").includes("bank"));
    const bbWon = bbEvents.some((e) => e.result === "won" || e.result === "win");
    const bbLost = bbEvents.some((e) => e.result === "lost");
    const bbResult: TimelineDay["bankBuilderResult"] = bbWon && bbLost ? "mixed" : bbWon ? "won" : bbLost ? "lost" : (bbEvents.length ? "flat" : null);
    const products = [...new Set((d.events ?? []).map((e) => PRODUCT_META[e.category ?? ""]?.code).filter(Boolean) as string[])];
    const wonRung = bbEvents.filter((e) => (e.result === "won" || e.result === "win") && e.step != null).sort((a, b) => (b.step ?? 0) - (a.step ?? 0))[0];
    const settledCount = (d.events ?? []).filter((e) => e.status === "settled").length;
    const pendingCount = (d.events ?? []).filter((e) => e.status === "open" || e.status === "queued").length;

    const s = sign(d.pl);
    const headline =
      s === "win" && wonRung ? `Ladder step ${wonRung.step} won — bankroll ${money(opening)} → ${money(closing)}`
      : s === "win" ? `Up ${money(d.pl)} — bankroll ${money(closing)}`
      : s === "loss" ? `Down ${money(Math.abs(d.pl))} — ${dayL} seed${dayL === 1 ? "" : "s"} lost, bankroll ${money(closing)}`
      : `Rolled — bankroll holds at ${money(closing)}`;

    return {
      date: d.date, opening, closing, pl: round2(d.pl), plPct: opening > 0 ? round4(d.pl / opening) : 0, sign: s,
      dayWins: dayW, dayLosses: dayL, cumWins: cumW, cumLosses: cumL,
      roiMultiple: round2((closing - start) / start), hwm: round2(hwm), drawdown, drawdownPct: hwm > 0 ? round4(drawdown / hwm) : 0,
      products, ladderLabel: wonRung ? laneLabel(wonRung.laneId) : (bbEvents[0] ? laneLabel(bbEvents[0].laneId) : null),
      ladderStep: wonRung?.step ?? null, settledCount, pendingCount, bankBuilderResult: bbResult, headline,
      events: d.events ?? [],
      bankedNote: d.date === bankDate && (residualW > 0 || residualL > 0)
        ? `Includes the early dual-lane phase: ${residualW} banked rung${residualW === 1 ? "" : "s"} cleared and ${residualL} $100 seed${residualL === 1 ? "" : "s"} lost (officially recorded, tracked in aggregate).`
        : null,
    };
  });

  // KPIs.
  const settledDays = timeline.filter((t) => t.settledCount > 0 || t.pl !== 0);
  const winDays = settledDays.filter((t) => t.sign === "win").length;
  const lossDays = settledDays.filter((t) => t.sign === "loss").length;
  const largestWinDay = timeline.reduce<{ date: string; pl: number } | null>((b, t) => (t.pl > (b?.pl ?? -Infinity) ? { date: t.date, pl: t.pl } : b), null);
  const largestLossDay = timeline.reduce<{ date: string; pl: number } | null>((w, t) => (t.pl < (w?.pl ?? Infinity) ? { date: t.date, pl: t.pl } : w), null);
  const intel = portfolio.intelligence ?? {};
  const bankroll = round2(portfolio.currentBankroll ?? running);
  const peak = round2(portfolio.highWaterMark ?? hwm);
  const kpis: FlagshipKpis = {
    record: { wins: canonW, losses: canonL },
    bankroll, peak,
    profit: round2(portfolio.settledProfit ?? (bankroll - start)),
    roiMultiple: round2(portfolio.roiMultiple ?? ((bankroll - start) / start)),
    roiPct: round2(((bankroll - start) / start) * 100),
    drawdown: round2(portfolio.drawdown ?? maxDrawdown),
    drawdownPct: round4(portfolio.drawdownPct ?? (peak > 0 ? (peak - bankroll) / peak : 0)),
    largestWinDay: largestWinDay && largestWinDay.pl > 0 ? largestWinDay : null,
    largestLossDay: largestLossDay && largestLossDay.pl < 0 ? largestLossDay : null,
    longestWinStreak: Number(intel.longestWinStreak ?? 0),
    longestLossStreak: Number(intel.longestLossStreak ?? 0),
    winRate: canonW + canonL > 0 ? round2((canonW / (canonW + canonL)) * 100) : 0,
    avgStake: Number(intel.avgStake ?? 0),
    profitFactor: intel.profitFactor ?? null,
    startingBankroll: start, startingDate,
    settledDays: settledDays.length, winDays, lossDays,
    currentDate: (portfolio.generatedAt ?? "").slice(0, 10) || (timeline[timeline.length - 1]?.date ?? startingDate),
  };

  timeline.reverse(); // newest first for display
  return { timeline, kpis };
}

function laneLabel(laneId?: string): string | null {
  if (!laneId) return null;
  if (laneId === "crown-ladder") return "Crown ladder";
  const s = laneId.slice(-1).toUpperCase();
  return `Lane ${s}`;
}
function money(n: number): string { return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`; }

/** Chart series — PURE, from the timeline (money) + master ledger (product attribution). */
export function buildCharts(timelineNewestFirst: TimelineDay[], masterLedger: any): FlagshipCharts {
  const chron = [...timelineNewestFirst].sort((a, b) => a.date.localeCompare(b.date));
  const bankroll = chron.map((t) => ({ date: t.date, closing: t.closing }));
  const dailyRoi = chron.map((t) => ({ date: t.date, pl: t.pl, plPct: round2(t.plPct * 100) }));
  const drawdown = chron.map((t) => ({ date: t.date, drawdown: t.drawdown, drawdownPct: round2(t.drawdownPct * 100) }));
  const heatmap = chron.map((t) => ({ date: t.date, pl: t.pl, sign: t.sign }));
  const productPerformance: ProductPerf[] = (masterLedger?.products ?? []).map((p: any) => {
    const wins = Number(p.record?.wins ?? 0), losses = Number(p.record?.losses ?? 0);
    const profit = round2(Number(p.profit ?? 0));
    const meta = PRODUCT_META[p.productId] ?? { glyph: "•", label: p.label };
    return {
      productId: p.productId, label: p.label, glyph: meta.glyph,
      wins, losses, bets: wins + losses, profit,
      winRate: wins + losses > 0 ? round2((wins / (wins + losses)) * 100) : 0,
      net: profit > 0.009 ? "positive" : profit < -0.009 ? "negative" : "flat", canonical: !!p.canonical,
    };
  }).filter((p: ProductPerf) => p.bets > 0 || p.canonical);
  return { bankroll, dailyRoi, drawdown, productPerformance, heatmap };
}

/** Bank Builder journey — completed crown ladders (banked-ladders) + today's active/approved lanes. PURE. */
export function buildJourney(banked: any, approved: any, today: string): BankBuilderJourney {
  const ladders: JourneyLadder[] = (banked?.ladders ?? []).map((l: any) => {
    let prev = round2(l.start ?? 100);
    const steps: JourneyStep[] = (l.steps ?? []).map((s: any) => {
      const before = round2(s.before ?? prev);
      const after = round2(s.after ?? before);
      prev = after;
      return { step: s.step, before, after, result: s.result ?? "won", date: s.date ?? null, legs: (s.legs ?? []).map((x: any) => (typeof x === "string" ? x : x.selection ?? "")), profit: round2(after - before) };
    });
    const wins = steps.filter((s) => s.result === "won" || s.result === "win").length;
    return { ladder: l.ladder, label: l.label, start: round2(l.start ?? 100), final: round2(l.final ?? prev), completedDate: l.completedDate ?? null, result: `${wins}–0`, steps };
  });
  const dateOk = approved && approved.date === today && Array.isArray(approved.lanes);
  const activeLanes: JourneyActiveLane[] = dateOk ? approved.lanes.map((ln: any) => ({
    lane: ln.lane, kind: ln.kind ?? "survival", label: ln.label ?? `Lane ${ln.lane}`,
    step: Number(ln.step ?? 1), clearedSteps: Number(ln.clearedSteps ?? 0),
    stake: round2(ln.stake ?? 100), potentialReturn: ln.potentialReturn != null ? round2(ln.potentialReturn) : null,
    combinedOdds: ln.combinedOdds ?? null, confidence: ln.confidence ?? null,
    legs: (ln.legs ?? []).map((lg: any) => ({ selection: lg.selection, odds: lg.americanOdds ?? null, marketLabel: lg.marketLabel, matchup: lg.matchup ?? null })),
    whyLadderPick: ln.whyLadderPick ?? null,
  })) : [];
  return { crownTotal: round2(banked?.crownTotal ?? 0), ladders, activeLanes, activeAsOf: dateOk ? approved.date : null };
}

/** Unified wager log across products for the attribution view — BB (rich, from the ledger events) plus the
 *  side lanes (from master-ledger per-product history). Newest first. PURE. */
export function buildWagerLog(days: DailyDay[], masterLedger: any): WagerRow[] {
  const rows: WagerRow[] = [];
  // Bank Builder — each dated settled ledger event with real legs.
  for (const d of days ?? []) {
    for (const e of d.events ?? []) {
      if (e.status !== "settled") continue;
      const outcome: WagerRow["outcome"] = (e.result === "won" || e.result === "win") ? "won" : e.result === "lost" ? "lost" : "void";
      if (e.type === "lane_advanced" || e.type === "ladder_completed") continue;
      const detail = (e.legs ?? []).map((l) => l.selection).filter(Boolean).join(" + ") || e.notes || null;
      rows.push({
        date: e.date ?? d.date, productId: "bank-builder", productLabel: "Bank Builder", glyph: "🏦",
        outcome, stake: round2(e.paperStake ?? 0), payout: round2(e.paperReturn ?? 0), profit: round2(e.paperProfit ?? 0),
        canonical: true, detail: e.type === "dual_lane_losses" ? (e.notes ?? "Dual-lane phase seeds") : detail,
      });
    }
  }
  // Side lanes — Moonshot, WC Specials, Homer Nukes (date + outcome + stake from the product ledger).
  for (const p of masterLedger?.products ?? []) {
    if (p.productId === "bank-builder") continue;
    const meta = PRODUCT_META[p.productId] ?? { glyph: "•", label: p.label };
    for (const h of p.history ?? []) {
      const outcome: WagerRow["outcome"] = h.outcome === "won" ? "won" : h.outcome === "lost" ? "lost" : "void";
      rows.push({
        date: h.date, productId: p.productId, productLabel: p.label, glyph: meta.glyph,
        outcome, stake: round2(h.stake ?? 0), payout: round2(h.payout ?? 0), profit: round2((h.payout ?? 0) - (h.stake ?? 0)),
        canonical: false, detail: null,
      });
    }
  }
  return rows.sort((a, b) => (b.date.localeCompare(a.date)) || (a.productId < b.productId ? -1 : 1));
}

// ── Today's status (Phase 7) ────────────────────────────────────────────────────────────────────
export interface TodayStatus {
  date: string;
  pendingExposure: number;
  settlementStatus: string;                 // "Settled through Jul 2 · Jul 3 in progress"
  lastSettledDate: string | null;
  products: { productId: string; label: string; glyph: string; exposure: number; href: string; live: boolean }[];
  activeBankBuilder: JourneyActiveLane[];
}

const HREF: Record<string, string> = { "bank-builder": "/bank-builder", moonshot: "/moonshot", "wc-specials": "/results/", "homer-nukes": "/homer-nukes" };

/** Orchestrator — reads the canonical artifacts and composes the full flagship model. Server/build-time. */
export function buildFlagship(root: string, nowIso: string, today: string): Flagship & { todayStatus: TodayStatus } {
  const read = (rel: string): any => { try { return JSON.parse(fs.readFileSync(path.join(root, "mr-dub", rel), "utf8")); } catch { return null; } };
  const portfolio: PortfolioDoc = read("portfolio.json") ?? {};
  const daily = read("daily-summary.json");
  const banked = read("banked-ladders.json");
  const approved = read("bank-builder-approved.json");
  const days: DailyDay[] = daily?.days ?? [];

  const { timeline, kpis } = buildTimeline(days, portfolio);
  const masterLedger = buildMasterLedger(root, nowIso, today);
  const charts = buildCharts(timeline, masterLedger);
  const journey = buildJourney(banked, approved, today);
  const wagers = buildWagerLog(days, masterLedger);

  const oe = computeOpenExposure(root, today);
  const lastSettledDate = timeline[0]?.date ?? null;
  const settlementStatus = lastSettledDate
    ? (lastSettledDate < today ? `Settled through ${fmtDate(lastSettledDate)} · ${fmtDate(today)} in progress` : `Settled through ${fmtDate(lastSettledDate)}`)
    : "Awaiting first settlement";
  const products = oe.byProduct.map((p) => ({
    productId: p.productId, label: p.label, glyph: p.glyph, exposure: round2(p.amount),
    href: HREF[p.productId] ?? "/", live: p.amount > 0,
  }));
  const todayStatus: TodayStatus = {
    date: today, pendingExposure: round2(oe.total), settlementStatus, lastSettledDate,
    products, activeBankBuilder: journey.activeLanes,
  };

  return { kpis, timeline, charts, journey, wagers, todayStatus };
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const mm = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1] ?? "";
  return `${mm} ${d}`;
}
