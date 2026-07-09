"use client";

/**
 * GameSimulationRunner — the "Generate Simulation" REVEAL for one MLB fixture.
 *
 * It renders the PRECOMPUTED, deterministic simulation view built at BUILD TIME by
 * `buildGameSimulationView` (@/lib/game-simulations/game-lab-view) and threaded through
 * `game-detail.ts` as a prop. This component is animation-ONLY: clicking "Generate Simulation"
 * plays a staged reveal from pure client state (setTimeout + CSS), then shows the artifact that was
 * ALREADY loaded. It does NOT fetch, read the filesystem, write anything, or randomize — every user
 * sees the SAME picks for the same game + model version.
 *
 * HONESTY (mirrors the artifact contract + validator):
 *   • The word "simulated" / a run count appears ONLY when the view says so:
 *       - a "ready" (or "stale") status carries the real payload;
 *       - "N-run" copy is gated on `view.allowsRunCountClaim` (runCount is a positive integer).
 *   • Histograms render ONLY when `view.distributions` is present (a real, non-empty block).
 *   • No xG / corners / cards / first-scorer — those are declared "not generated" and shown as such.
 *   • Copy is deterministic + paper-only, and stays inside the honest-language allowlist (no hype /
 *     no certainty / no in-play-wagering terms). The reveal replays a precomputed, seeded artifact.
 *
 * The existing `MlbGameLabReport` stays visible regardless — this is an additive reveal beside it.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import type { GameSimulationView } from "@/lib/game-simulations/game-lab-view";
import type { SimGeneratedPick, SimDistribution } from "@/lib/game-simulations/types";
import {
  SportSimulationAnimation,
  SIMULATION_MIN_DURATION_MS,
  SIMULATION_STAGES,
} from "./simulation-animation";

/**
 * The dashboard modules the reveal unlocks — shown BEFORE the click as locked/preview pills ONLY (labels,
 * never data), so the user knows what is coming without seeing any posted price, prop, or distribution.
 */
const DASHBOARD_PREVIEW_PILLS = [
  "Market snapshot",
  "Central read",
  "Main takeaways",
  "Biggest leans",
  "Player / prop table",
  "Distributions",
  "Market agreement",
  "Recap",
] as const;

// ── formatters (always fall back to an em dash; never render undefined/NaN) ──
const dash = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" || (typeof v === "number" && !Number.isFinite(v)) ? "—" : String(v);
const pct = (n?: number | null) => (n == null || !Number.isFinite(n) ? "—" : `${Math.round(n * 100)}%`);
const num2 = (n?: number | null) => (n == null || !Number.isFinite(n) ? "—" : n.toFixed(2));
const edgeTxt = (n?: number | null) =>
  n == null || !Number.isFinite(n) ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

/** Human "x days ago"/"today" from an ISO timestamp using the browser clock (client-only, honest). */
function freshnessLabel(iso: string | null): string {
  if (!iso) return "generated recently";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "generated recently";
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days <= 0) return "generated today";
  if (days === 1) return "generated 1 day ago";
  return `generated ${days} days ago`;
}

const RISK_TONE: Record<string, string> = {
  anchor: "var(--vault-success)",
  core: "var(--vault-gold-bright)",
  value: "var(--vault-gold-bright)",
  longshot: "var(--gtp-bank-heat)",
};

function Eyebrow({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="font-mono uppercase tracking-[0.13em]"
      style={{ color: color ?? "var(--vault-gold-bright)", fontSize: 9.5 }}
    >
      {children}
    </span>
  );
}

/** One generated pick, rendered like the MLB report cards (paper-only). `top` highlights the strongest
 *  lean (the highest-edge pick — the list is edge-ranked). */
function GeneratedPickCard({ p, top }: { p: SimGeneratedPick; top?: boolean }) {
  const selection =
    (p.player ? `${p.player} · ` : p.team ? `${p.team} · ` : "") +
    `${dash(p.side)}${p.line != null ? ` ${p.line}` : ""}`;
  return (
    <div
      className="flex flex-col gap-2 rounded-[12px] px-3.5 py-3"
      style={{ background: "rgba(26, 16, 11,0.6)", border: `1px solid ${top ? "var(--vault-gold-bright)" : "var(--vault-border)"}`, boxShadow: top ? "0 0 0 1px rgba(242,54,69,0.22)" : "none" }}
    >
      {top ? (
        <span className="inline-flex items-center self-start rounded-full px-2 py-0.5 font-mono font-bold uppercase tracking-[0.1em]"
          style={{ color: "var(--vault-gold-bright)", background: "rgba(242,54,69,0.10)", border: "1px solid var(--vault-gold-bright)", fontSize: 8.5 }}>
          ★ Strongest lean
        </span>
      ) : null}
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span
            className="font-display tracking-tight break-words leading-tight"
            style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 700 }}
          >
            {selection}
          </span>
          <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
            {dash(p.market)}
          </span>
        </div>
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.1em] shrink-0"
          style={{
            color: RISK_TONE[p.riskTier] ?? "var(--vault-text-mute)",
            border: `1px solid ${RISK_TONE[p.riskTier] ?? "var(--vault-rule)"}`,
            fontSize: 8.5,
            background: "rgba(255,255,255,0.02)",
          }}
        >
          {dash(p.riskTier)}
        </span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-x-3 gap-y-2">
        <Stat label="Proj" value={num2(p.projection)} />
        <Stat label="Model" value={pct(p.modelProbability)} />
        <Stat label="Market" value={pct(p.marketProbability)} />
        <Stat label="Edge" value={edgeTxt(p.edgePct)} color={(p.edgePct ?? 0) >= 0 ? "var(--vault-success)" : "var(--gtp-bank-heat)"} />
        <Stat label="Conf" value={pct(p.confidence)} />
      </div>
      {/* Visual depth — real fields only: the model-vs-market edge bar + the projection-vs-line track. */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:gap-4">
        <div className="flex-1"><ProbBar model={p.modelProbability} market={p.marketProbability} /></div>
        <div className="flex-1"><ProjVsLine projection={p.projection} line={p.line} side={p.side} /></div>
      </div>
      {p.reasonBullets.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {p.reasonBullets.map((b, i) => (
            <li key={i} className="text-[11px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
              · {dash(b)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>
        {label}
      </span>
      <span className="font-mono" style={{ color: color ?? "var(--vault-text)", fontSize: 12.5, fontWeight: 600 }}>
        {value}
      </span>
    </div>
  );
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// ─────────────────────────────────────────────────────────────────────────────
// PURE derivation helpers (exported for real-timer-free unit tests). Everything
// below is deterministic — same picks in ⇒ same output — and reads ONLY real
// artifact fields. Nothing here fabricates a probability, odds, score, or win%.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Humanize a raw board market key for display: split on "_" and title-case each
 * token (e.g. "batter_total_bases" → "Batter Total Bases"). Presentation only —
 * it never changes a number. Empty/nullish ⇒ em dash.
 */
export function humanizeMarket(market?: string | null): string {
  if (market == null || market === "") return "—";
  return String(market)
    .split("_")
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Only picks that carry a real (priced) market probability. */
export function pricedPicks(picks: SimGeneratedPick[]): SimGeneratedPick[] {
  return (picks ?? []).filter((p) => p.marketProbability != null && Number.isFinite(p.marketProbability));
}

/**
 * One derived takeaway card's data. All fields trace back to a real pick.
 */
export interface SimTakeaway {
  key: "strongest_lean" | "highest_confidence" | "biggest_edge" | "common_market";
  label: string;
  /** The headline value (already formatted for display). */
  value: string;
  /** The pick/family this takeaway was derived from (for honest attribution). */
  from: string;
}

/**
 * Derive 3–4 takeaway cards from the generated picks, all from real fields and
 * fully deterministic. Ties break by FIRST occurrence, then alphabetically by a
 * stable subject string — never by a timer or random draw. Empty picks ⇒ [].
 */
export function deriveTakeaways(picks: SimGeneratedPick[]): SimTakeaway[] {
  const list = picks ?? [];
  if (list.length === 0) return [];

  const subjectOf = (p: SimGeneratedPick) => p.player || p.team || humanizeMarket(p.market);
  // Deterministic key for alphabetical tie-breaks (subject + market + side + line).
  const alphaKey = (p: SimGeneratedPick) =>
    `${subjectOf(p)}|${humanizeMarket(p.market)}|${dash(p.side)}|${p.line ?? ""}`.toLowerCase();

  // Pick the extreme by a numeric selector; ties → first occurrence, then alpha.
  const extremeBy = (sel: (p: SimGeneratedPick) => number): SimGeneratedPick => {
    let best = list[0];
    let bestIdx = 0;
    for (let i = 1; i < list.length; i += 1) {
      const p = list[i];
      const v = sel(p);
      const bv = sel(best);
      if (!Number.isFinite(v)) continue;
      if (!Number.isFinite(bv) || v > bv) {
        best = p;
        bestIdx = i;
      } else if (v === bv) {
        // tie: keep earlier index (already have it); if same index impossible, alpha decides.
        if (alphaKey(p) < alphaKey(best) && i < bestIdx) {
          best = p;
          bestIdx = i;
        }
      }
    }
    return best;
  };

  const strongest = extremeBy((p) => (Number.isFinite(p.edgePct) ? p.edgePct : -Infinity));
  const confident = extremeBy((p) => (Number.isFinite(p.confidence) ? p.confidence : -Infinity));

  // Most common humanized market family — mode; ties → first-seen family (insertion order).
  const familyCounts = new Map<string, number>();
  for (const p of list) {
    const fam = humanizeMarket(p.market);
    familyCounts.set(fam, (familyCounts.get(fam) ?? 0) + 1);
  }
  let modeFamily = humanizeMarket(list[0].market);
  let modeCount = 0;
  for (const [fam, count] of familyCounts) {
    if (count > modeCount) {
      modeFamily = fam;
      modeCount = count;
    }
  }

  const out: SimTakeaway[] = [
    {
      key: "strongest_lean",
      label: "Strongest lean",
      value: edgeTxt(strongest.edgePct),
      from: `${subjectOf(strongest)} · ${humanizeMarket(strongest.market)} ${dash(strongest.side)}${strongest.line != null ? ` ${strongest.line}` : ""}`,
    },
    {
      key: "highest_confidence",
      label: "Highest confidence",
      value: pct(confident.confidence),
      from: `${subjectOf(confident)} · ${humanizeMarket(confident.market)} ${dash(confident.side)}${confident.line != null ? ` ${confident.line}` : ""}`,
    },
    {
      key: "biggest_edge",
      label: "Biggest edge value",
      value: edgeTxt(strongest.edgePct),
      from: `from ${subjectOf(strongest)} · ${humanizeMarket(strongest.market)}`,
    },
    {
      key: "common_market",
      label: "Most common market",
      value: modeFamily,
      from: `${modeCount} of ${list.length} generated pick${list.length === 1 ? "" : "s"}`,
    },
  ];
  return out;
}

/** The current-slate model-vs-market agreement summary (NOT historical calibration). */
export interface SimMarketAgreement {
  /** Count of picks carrying BOTH a model and a market probability. */
  pricedCount: number;
  /** Mean absolute |model − market| gap, in probability points (0..1). */
  avgGap: number;
  /** The single widest |model − market| gap among priced picks (0..1). */
  widestGap: number;
  /** The pick that owns the widest gap (for honest attribution). */
  widestPick: SimGeneratedPick;
  /** A tier label derived from `avgGap`: ≤0.06 "tightly aligned", ≤0.12 "moderate", else "stretched". */
  tier: "tightly aligned" | "moderate" | "stretched";
}

/**
 * Compute the CURRENT-SLATE model-vs-market agreement over ONLY the picks that
 * carry both a model AND a market probability. Returns null when there are zero
 * priced picks (the module is then hidden entirely). This is a snapshot of THIS
 * artifact's spread — it is NOT a Brier score or long-term calibration.
 */
export function marketAgreement(picks: SimGeneratedPick[]): SimMarketAgreement | null {
  const priced = (picks ?? []).filter(
    (p) =>
      p.modelProbability != null &&
      Number.isFinite(p.modelProbability) &&
      p.marketProbability != null &&
      Number.isFinite(p.marketProbability),
  );
  if (priced.length === 0) return null;

  let sum = 0;
  let widestGap = -Infinity;
  let widestPick = priced[0];
  for (const p of priced) {
    const gap = Math.abs((p.modelProbability as number) - (p.marketProbability as number));
    sum += gap;
    if (gap > widestGap) {
      widestGap = gap;
      widestPick = p;
    }
  }
  const avgGap = sum / priced.length;
  const tier: SimMarketAgreement["tier"] = avgGap <= 0.06 ? "tightly aligned" : avgGap <= 0.12 ? "moderate" : "stretched";

  return { pricedCount: priced.length, avgGap, widestGap, widestPick, tier };
}

/**
 * Build a copyable plain-text recap from ONLY real fields. The "N-run" line is
 * gated on `allowsRunCountClaim && runCount != null`; otherwise it is omitted.
 * No fabricated claims and nothing from the banned-copy list.
 */
export function buildRecap(view: GameSimulationView): string {
  const lines: string[] = [];
  const matchup =
    view.teams && (view.teams.away || view.teams.home)
      ? `${dash(view.teams.away)} @ ${dash(view.teams.home)}`
      : "Matchup —";
  lines.push(matchup);
  lines.push(`Model ${dash(view.modelVersion)}`);
  if (view.allowsRunCountClaim && view.runCount != null) {
    lines.push(`${view.runCount.toLocaleString()}-run simulation`);
  }

  const lean = view.generatedPicks[0];
  if (lean) {
    const subject = lean.player || lean.team || humanizeMarket(lean.market);
    lines.push(
      `Strongest lean: ${subject} — ${humanizeMarket(lean.market)} ${dash(lean.side)}${lean.line != null ? ` ${lean.line}` : ""}`,
    );
    lines.push(`  Model ${pct(lean.modelProbability)} · Market ${pct(lean.marketProbability)} · Edge ${edgeTxt(lean.edgePct)}`);
  } else {
    lines.push("Strongest lean: no qualified lean generated");
  }

  lines.push(`Generated picks: ${view.generatedPicks.length}`);
  lines.push("Paper-only · deterministic · not betting advice");
  return lines.join("\n");
}

/**
 * Model-vs-market probability bar — a visual of the edge, built ONLY from the pick's real
 * `modelProbability` (bar fill) and `marketProbability` (a tick). The gap between them IS the edge.
 * Renders nothing when the model probability is absent (never a fabricated bar).
 */
function ProbBar({ model, market }: { model?: number | null; market?: number | null }) {
  if (model == null || !Number.isFinite(model)) return null;
  const m = clamp01(model);
  const mk = market != null && Number.isFinite(market) ? clamp01(market) : null;
  const ahead = mk == null || m >= mk;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between font-mono uppercase tracking-[0.1em]" style={{ fontSize: 8, color: "var(--vault-text-faint)" }}>
        <span>Model {pct(model)}</span>
        {mk != null ? <span>Market {pct(market)}</span> : null}
      </div>
      <div className="relative w-full rounded-full" style={{ height: 6, background: "rgba(255,255,255,0.07)" }}>
        <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${m * 100}%`, background: ahead ? "var(--vault-success)" : "var(--gtp-bank-heat)", transition: "width 300ms ease" }} />
        {mk != null ? (
          <div className="absolute" style={{ top: -2, left: `calc(${mk * 100}% - 1px)`, width: 2, height: 10, background: "var(--vault-text)" }} title={`Market ${pct(market)}`} aria-hidden />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Projection-vs-line visual — the model projection placed against the market line on a shared track
 * (0 → ~2× the line). Built ONLY from the pick's real `projection`, `line`, and `side`. Renders nothing
 * when either number is missing.
 */
function ProjVsLine({ projection, line, side }: { projection?: number | null; line?: number | null; side?: string | null }) {
  if (projection == null || line == null || !Number.isFinite(projection) || !Number.isFinite(line) || line <= 0) return null;
  const span = Math.max(line * 2, projection * 1.15, 1);
  const linePct = clamp01(line / span) * 100;
  const projPct = clamp01(projection / span) * 100;
  const over = String(side ?? "").toLowerCase().includes("over");
  const clears = over ? projection >= line : projection <= line;
  const tone = clears ? "var(--vault-success)" : "var(--gtp-bank-heat)";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between font-mono uppercase tracking-[0.1em]" style={{ fontSize: 8, color: "var(--vault-text-faint)" }}>
        <span>Proj {num2(projection)}</span>
        <span>Line {num2(line)} · {dash(side)}</span>
      </div>
      <div className="relative w-full rounded-full" style={{ height: 6, background: "rgba(255,255,255,0.07)" }}>
        {/* the line marker */}
        <div className="absolute" style={{ top: -2, left: `calc(${linePct}% - 1px)`, width: 2, height: 10, background: "var(--vault-text-mute)" }} title={`Line ${num2(line)}`} aria-hidden />
        {/* the projection dot */}
        <div className="absolute rounded-full" style={{ top: -1, left: `calc(${projPct}% - 4px)`, width: 8, height: 8, background: tone, boxShadow: `0 0 6px ${tone}` }} title={`Projection ${num2(projection)}`} aria-hidden />
      </div>
    </div>
  );
}

/** A single distribution as a compact honest histogram (only rendered when distributions exist). */
function DistributionCard({ d }: { d: SimDistribution }) {
  const maxP = d.bins.reduce((m, b) => (Number.isFinite(b.probability) ? Math.max(m, b.probability) : m), 0) || 1;
  return (
    <div
      className="flex flex-col gap-2 rounded-[12px] px-3.5 py-3"
      style={{ background: "rgba(26, 16, 11,0.6)", border: "1px solid var(--vault-border)" }}
    >
      <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 12.5, fontWeight: 600 }}>
        {dash(d.label)}
      </span>
      <div className="flex items-end gap-1" style={{ height: 48 }}>
        {d.bins.map((b, i) => {
          const h = Math.max(3, Math.round((b.probability / maxP) * 44));
          return (
            <div
              key={i}
              className="flex flex-1 flex-col items-center gap-0.5"
              title={`${dash(b.label)}: ${pct(b.probability)}${b.count != null ? ` · ${b.count} samples` : ""}`}
            >
              <div
                style={{ width: "100%", maxWidth: 16, height: h, borderRadius: 3, background: "var(--vault-gold-bright)", opacity: 0.7 }}
              />
              <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 7.5 }}>
                {dash(b.label)}
              </span>
            </div>
          );
        })}
      </div>
      {d.sampleCount != null ? (
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>
          {d.sampleCount.toLocaleString()} deterministic samples · same output every run
        </span>
      ) : null}
    </div>
  );
}

/** A tiny section heading (eyebrow + title + optional sub-line), reused across the new modules. */
function ModuleHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h3 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>
        {title}
      </h3>
      {sub ? (
        <span style={{ color: "var(--vault-text-faint)", fontSize: 11.5, lineHeight: 1.5 }}>{sub}</span>
      ) : null}
    </div>
  );
}

/**
 * PricedPropSnapshot — the market-snapshot analogue, built from the picks that carry a REAL market
 * probability (i.e. priced markets). Compact grid: subject · market · side/line · projection · model%
 * · market% · edge. The widest model-vs-market gap pick is highlighted. Honest empty state when there
 * are no priced markets in this artifact.
 */
function PricedPropSnapshot({ picks }: { picks: SimGeneratedPick[] }) {
  const priced = pricedPicks(picks);
  // Widest |model − market| gap among priced picks (only meaningful when a model prob also exists).
  let widestId: string | null = null;
  let widest = -Infinity;
  for (const p of priced) {
    if (p.modelProbability == null || !Number.isFinite(p.modelProbability)) continue;
    const gap = Math.abs(p.modelProbability - (p.marketProbability as number));
    if (gap > widest) {
      widest = gap;
      widestId = p.id;
    }
  }
  return (
    <section className="flex flex-col gap-2.5">
      <ModuleHead
        eyebrow={`Priced prop snapshot · ${priced.length}`}
        title="Where the model met a market price"
        sub="Only picks with a real market price — projection vs the book, per pick. Widest model-vs-market gap is highlighted."
      />
      {priced.length === 0 ? (
        <div className="rounded-[12px] px-4 py-3.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed var(--vault-border)" }}>
          <p className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
            No priced markets in this artifact — nothing is shown here rather than a fabricated price.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {priced.map((p) => {
            const isWidest = p.id === widestId;
            const subject = p.player || p.team || humanizeMarket(p.market);
            return (
              <div
                key={p.id}
                className="flex flex-col gap-1.5 rounded-[11px] px-3 py-2.5"
                style={{
                  background: "rgba(26, 16, 11,0.55)",
                  border: `1px solid ${isWidest ? "var(--vault-gold-bright)" : "var(--vault-border)"}`,
                  boxShadow: isWidest ? "0 0 0 1px rgba(242,54,69,0.18)" : "none",
                }}
              >
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-display tracking-tight break-words leading-tight" style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 700 }}>
                      {subject}
                    </span>
                    <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
                      {humanizeMarket(p.market)} · {dash(p.side)}{p.line != null ? ` ${p.line}` : ""}
                    </span>
                  </div>
                  {isWidest ? (
                    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 font-mono uppercase tracking-[0.1em] shrink-0"
                      style={{ color: "var(--vault-gold-bright)", border: "1px solid var(--vault-gold-bright)", fontSize: 7.5, background: "rgba(242,54,69,0.10)" }}>
                      Widest gap
                    </span>
                  ) : null}
                </div>
                <div className="grid grid-cols-4 gap-x-2 gap-y-1">
                  <Stat label="Proj" value={num2(p.projection)} />
                  <Stat label="Model" value={pct(p.modelProbability)} />
                  <Stat label="Market" value={pct(p.marketProbability)} />
                  <Stat label="Edge" value={edgeTxt(p.edgePct)} color={(p.edgePct ?? 0) >= 0 ? "var(--vault-success)" : "var(--gtp-bank-heat)"} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * CentralRead — the model's single strongest lean (generatedPicks[0], already edge-sorted). A prop
 * READ, never a game score or win probability. Prominent card with subject, market, side/line,
 * projection, model%, market%, edge, confidence, risk tier, and the pick's reason bullets. Echoes the
 * summary headline as one supporting line when present. Honest "no qualified lean" when picks empty.
 */
function CentralRead({ view }: { view: GameSimulationView }) {
  const lean = view.generatedPicks[0];
  return (
    <section className="flex flex-col gap-2.5">
      <ModuleHead eyebrow="Central read" title="The model's single strongest lean" sub="A prop lean — not a predicted final score or win probability." />
      {!lean ? (
        <div className="rounded-[12px] px-4 py-3.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed var(--vault-border)" }}>
          <p className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
            No qualified lean for this game — the model produced no pick to feature, and nothing is invented to fill the slot.
          </p>
        </div>
      ) : (
        <div
          className="flex flex-col gap-2.5 rounded-[14px] px-4 py-4"
          style={{ border: "1px solid var(--vault-gold-bright)", background: "linear-gradient(135deg, rgba(22,30,62,0.9) 0%, rgba(26, 16, 11,0.96) 100%)", boxShadow: "0 0 0 1px rgba(242,54,69,0.20)" }}
        >
          <span className="inline-flex items-center self-start rounded-full px-2 py-0.5 font-mono font-bold uppercase tracking-[0.1em]"
            style={{ color: "var(--vault-gold-bright)", background: "rgba(242,54,69,0.10)", border: "1px solid var(--vault-gold-bright)", fontSize: 8.5 }}>
            ★ Strongest lean · prop read
          </span>
          <div className="flex items-start justify-between gap-2 min-w-0">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-display tracking-tight break-words leading-tight" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 800 }}>
                {(lean.player ? `${lean.player} · ` : lean.team ? `${lean.team} · ` : "") + `${dash(lean.side)}${lean.line != null ? ` ${lean.line}` : ""}`}
              </span>
              <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
                {humanizeMarket(lean.market)}
              </span>
            </div>
            <span className="inline-flex items-center rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.1em] shrink-0"
              style={{ color: RISK_TONE[lean.riskTier] ?? "var(--vault-text-mute)", border: `1px solid ${RISK_TONE[lean.riskTier] ?? "var(--vault-rule)"}`, fontSize: 8.5, background: "rgba(255,255,255,0.02)" }}>
              {dash(lean.riskTier)}
            </span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-x-3 gap-y-2">
            <Stat label="Proj" value={num2(lean.projection)} />
            <Stat label="Model" value={pct(lean.modelProbability)} />
            <Stat label="Market" value={pct(lean.marketProbability)} />
            <Stat label="Edge" value={edgeTxt(lean.edgePct)} color={(lean.edgePct ?? 0) >= 0 ? "var(--vault-success)" : "var(--gtp-bank-heat)"} />
            <Stat label="Conf" value={pct(lean.confidence)} />
          </div>
          <ProbBar model={lean.modelProbability} market={lean.marketProbability} />
          {lean.reasonBullets.length > 0 ? (
            <ul className="flex flex-col gap-0.5">
              {lean.reasonBullets.map((b, i) => (
                <li key={i} className="text-[11.5px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>· {dash(b)}</li>
              ))}
            </ul>
          ) : null}
          {view.simulationSummary?.headline ? (
            <p className="text-[11.5px] leading-snug" style={{ color: "var(--vault-text-faint)", borderTop: "1px solid var(--vault-rule)", paddingTop: 8 }}>
              Model read: {dash(view.simulationSummary.headline)}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

/**
 * MainTakeaways — 3–4 derived cards (strongest lean, highest confidence, biggest edge value, most
 * common market family). Every card names the pick/value it came from. All from real fields, fully
 * deterministic (see `deriveTakeaways`). Renders nothing when there are no picks.
 */
function MainTakeaways({ picks }: { picks: SimGeneratedPick[] }) {
  const takeaways = deriveTakeaways(picks);
  if (takeaways.length === 0) return null;
  return (
    <section className="flex flex-col gap-2.5">
      <ModuleHead eyebrow="Main takeaways" title="What stands out in this run" sub="Derived from the generated picks — each card names where it came from." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {takeaways.map((t) => (
          <div key={t.key} className="flex flex-col gap-1 rounded-[11px] px-3.5 py-3" style={{ background: "rgba(26, 16, 11,0.6)", border: "1px solid var(--vault-border)" }}>
            <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>{t.label}</span>
            <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 700 }}>{dash(t.value)}</span>
            <span className="text-[10.5px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>{dash(t.from)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * PropTable — a scrollable table of ALL generated picks (capped at a sensible top-N with an honest
 * "showing top N of M" note when capped). Every cell is null-guarded. This is the full ledger of what
 * the run produced, paper-only.
 */
const PROP_TABLE_CAP = 12;
function PropTable({ picks }: { picks: SimGeneratedPick[] }) {
  const list = picks ?? [];
  if (list.length === 0) return null;
  const rows = list.slice(0, PROP_TABLE_CAP);
  const capped = list.length > PROP_TABLE_CAP;
  const th = "px-2.5 py-1.5 text-left font-mono uppercase tracking-[0.08em] whitespace-nowrap";
  const td = "px-2.5 py-1.5 whitespace-nowrap";
  return (
    <section className="flex flex-col gap-2.5">
      <ModuleHead
        eyebrow="Player / prop table"
        title="Every generated pick"
        sub={capped ? `Showing top ${PROP_TABLE_CAP} of ${list.length} generated picks — ranked by edge, nothing silently dropped.` : "Ranked by edge — every pick the run produced."}
      />
      <div className="rounded-[12px]" style={{ border: "1px solid var(--vault-border)", overflowX: "auto" }}>
        <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 11.5 }}>
          <thead>
            <tr style={{ background: "rgba(0,0,0,0.25)", color: "var(--vault-text-faint)", fontSize: 8.5 }}>
              <th className={th}>Subject</th>
              <th className={th}>Market</th>
              <th className={th}>Side</th>
              <th className={th}>Line</th>
              <th className={th}>Proj</th>
              <th className={th}>Model%</th>
              <th className={th}>Market%</th>
              <th className={th}>Edge</th>
              <th className={th}>Conf</th>
              <th className={th}>Risk</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} style={{ borderTop: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)" }}>
                <td className={td} style={{ color: "var(--vault-text)", fontWeight: 600 }}>{dash(p.player || p.team || "—")}</td>
                <td className={td}>{humanizeMarket(p.market)}</td>
                <td className={td}>{dash(p.side)}</td>
                <td className={`${td} font-mono`}>{p.line != null ? num2(p.line) : "—"}</td>
                <td className={`${td} font-mono`}>{num2(p.projection)}</td>
                <td className={`${td} font-mono`}>{pct(p.modelProbability)}</td>
                <td className={`${td} font-mono`}>{pct(p.marketProbability)}</td>
                <td className={`${td} font-mono`} style={{ color: (p.edgePct ?? 0) >= 0 ? "var(--vault-success)" : "var(--gtp-bank-heat)" }}>{edgeTxt(p.edgePct)}</td>
                <td className={`${td} font-mono`}>{pct(p.confidence)}</td>
                <td className={td} style={{ color: RISK_TONE[p.riskTier] ?? "var(--vault-text-mute)" }}>{dash(p.riskTier)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * MarketAgreement — CURRENT-SLATE model-vs-market agreement (NOT historical calibration / Brier /
 * long-term accuracy). Average |model − market| gap over ONLY priced picks, the priced count, the
 * widest gap, and a tier label from the avg gap. Hidden entirely when zero priced picks.
 */
function MarketAgreement({ picks }: { picks: SimGeneratedPick[] }) {
  const a = marketAgreement(picks);
  if (!a) return null;
  const gapPts = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(1)} pts` : "—");
  const widestSubject = a.widestPick.player || a.widestPick.team || humanizeMarket(a.widestPick.market);
  return (
    <section className="flex flex-col gap-2.5">
      <ModuleHead
        eyebrow="Current-slate model-vs-market agreement"
        title="How far the model sits from the book — this slate"
        sub="A snapshot of THIS artifact's priced picks only. Not historical calibration or a long-term accuracy score."
      />
      <div className="flex flex-col gap-2.5 rounded-[12px] px-4 py-3.5" style={{ background: "rgba(26, 16, 11,0.6)", border: "1px solid var(--vault-border)" }}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Stat label="Avg gap" value={gapPts(a.avgGap)} />
          <Stat label="Priced picks" value={String(a.pricedCount)} />
          <Stat label="Widest gap" value={gapPts(a.widestGap)} />
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Alignment</span>
            <span className="inline-flex items-center self-start rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.1em]"
              style={{ color: "var(--vault-gold-bright)", border: "1px solid var(--vault-rule)", fontSize: 9, background: "rgba(217,164,65,0.10)" }}>
              {a.tier}
            </span>
          </div>
        </div>
        <span className="text-[10.5px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
          Widest gap: {widestSubject} · {humanizeMarket(a.widestPick.market)} — model {pct(a.widestPick.modelProbability)} vs market {pct(a.widestPick.marketProbability)}.
        </span>
      </div>
    </section>
  );
}

/**
 * RecapBlock — a copyable plain-text recap built ONLY from real fields (see `buildRecap`). The <pre>
 * is the always-present, selectable fallback; the "Copy recap" button uses a guarded
 * navigator.clipboard when available. No fabricated claims, no banned copy.
 */
function RecapBlock({ view }: { view: GameSimulationView }) {
  const recap = buildRecap(view);
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(recap).then(
        () => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        },
        () => setCopied(false),
      );
    }
  }, [recap]);
  return (
    <section className="flex flex-col gap-2.5">
      <ModuleHead eyebrow="Recap" title="Copy this run's recap" sub="Plain text, real fields only — paste it anywhere. The block below is always selectable." />
      <div className="flex flex-col gap-2 rounded-[12px] px-4 py-3.5" style={{ background: "rgba(0,0,0,0.28)", border: "1px solid var(--vault-border)" }}>
        <pre
          className="whitespace-pre-wrap break-words font-mono"
          style={{ color: "var(--vault-text-mute)", fontSize: 11.5, lineHeight: 1.55, margin: 0, userSelect: "text" }}
        >
          {recap}
        </pre>
        <button
          type="button"
          onClick={copy}
          className="vault-press inline-flex items-center self-start rounded-full px-3.5 font-mono uppercase tracking-[0.1em]"
          style={{ fontSize: 10.5, fontWeight: 700, minHeight: 34, color: "var(--vault-text)", background: "rgba(255,255,255,0.04)", border: "1px solid var(--vault-border-strong)", cursor: "pointer" }}
        >
          {copied ? "Copied" : "Copy recap"}
        </button>
      </div>
    </section>
  );
}

/** The "not generated" modules — honest edge of what the artifact does NOT contain. */
function UnavailableModules({ view }: { view: GameSimulationView }) {
  if (view.unavailableModules.length === 0) return null;
  return (
    <section
      className="flex flex-col gap-2 rounded-[14px] px-4 py-3.5"
      style={{ background: "rgba(255,255,255,0.015)", border: "1px dashed var(--vault-border)" }}
    >
      <div className="flex flex-col gap-0.5">
        <Eyebrow color="var(--vault-text-faint)">Not generated</Eyebrow>
        <span style={{ color: "var(--vault-text-faint)", fontSize: 11.5 }}>
          These modules were not generated for this game — we show only what the artifact actually contains, never a fabricated one.
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {view.unavailableModules.map((u) => (
          <div
            key={u.module}
            className="flex flex-col gap-0.5 rounded-[10px] px-3 py-2.5"
            style={{ background: "rgba(0,0,0,0.22)", border: "1px dashed var(--vault-rule)" }}
          >
            <span style={{ color: "var(--vault-text-mute)", fontSize: 12, fontWeight: 600 }}>{dash(u.displayCopy)}</span>
            <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
              {dash(u.module)} · {dash(u.reason)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function GameSimulationRunner({
  view,
  postReveal,
  homeLogo,
  awayLogo,
}: {
  view: GameSimulationView;
  /** Rendered ONLY in the done phase, below the dashboard — the dense report + spotlight + tabs shell,
   *  so on an MLB-sim page they are ABSENT from the pre-click DOM (gated behind the reveal). */
  postReveal?: React.ReactNode;
  homeLogo?: string | null;
  awayLogo?: string | null;
}) {
  const [phase, setPhase] = useState<"idle" | "revealing" | "done">("idle");
  const [stage, setStage] = useState(0);
  const timersRef = useRef<number[]>([]);

  const ready = view.status === "ready" || view.status === "stale";

  // Clear any pending stage timers on unmount so a mid-animation navigation never fires a stray setState.
  useEffect(() => {
    return () => {
      for (const t of timersRef.current) window.clearTimeout(t);
      timersRef.current = [];
    };
  }, []);

  // Pure client STAGING: advance `stage` across SIMULATION_STAGES over SIMULATION_MIN_DURATION_MS (≈1.25s
  // each), then flip to the done dashboard only after the FULL SIMULATION_MIN_DURATION_MS (10s) has
  // elapsed. NO data work, NO randomness — the payload is already loaded; this only stages its reveal, so
  // the same artifact is shown for every click. The done phase is GATED on SIMULATION_MIN_DURATION_MS: the
  // dashboard cannot appear on a sub-10s timer.
  const start = useCallback(() => {
    if (!ready) return;
    for (const t of timersRef.current) window.clearTimeout(t);
    timersRef.current = [];
    setPhase("revealing");
    setStage(0);

    const stageCount = SIMULATION_STAGES.length;
    const perStage = SIMULATION_MIN_DURATION_MS / stageCount; // ≈1.25s per stage across the 10s

    // Advance the pre-completion stages [1 .. stageCount-2] on evenly-spaced timers. The final
    // "complete" stage + the dashboard are BOTH gated on the full SIMULATION_MIN_DURATION_MS below.
    for (let i = 1; i < stageCount - 1; i += 1) {
      const t = window.setTimeout(() => setStage(i), Math.round(perStage * i));
      timersRef.current.push(t);
    }
    // The done gate: only at SIMULATION_MIN_DURATION_MS do we mark the final stage AND reveal the dashboard.
    const doneTimer = window.setTimeout(() => {
      setStage(stageCount - 1);
      setPhase("done");
    }, SIMULATION_MIN_DURATION_MS);
    timersRef.current.push(doneTimer);
  }, [ready]);

  // ── Unavailable: calm, non-broken. The existing Game Lab report stays visible above this. ──
  if (view.status === "unavailable" || view.status === "error") {
    return (
      <section
        className="flex flex-col gap-1.5 rounded-[14px] px-4 py-4"
        style={{ background: "rgba(255,255,255,0.015)", border: "1px dashed var(--vault-border)" }}
      >
        <Eyebrow color="var(--vault-text-faint)">Generate Simulation</Eyebrow>
        <span style={{ color: "var(--vault-text-mute)", fontSize: 13, fontWeight: 600 }}>
          Simulation not yet available for this game
        </span>
        <span style={{ color: "var(--vault-text-faint)", fontSize: 11.5, lineHeight: 1.5 }}>
          No precomputed model simulation artifact exists for this fixture yet. The model report above is built from the available data. Check back closer to the slate.
        </span>
      </section>
    );
  }

  // Copy that is only honest when a run count is actually claimable.
  const runCopy =
    view.allowsRunCountClaim && view.runCount != null
      ? `${view.runCount.toLocaleString()}-run simulation`
      : "model simulation";
  const versionNote = view.modelVersion ? `model ${view.modelVersion}` : "current model";

  return (
    <section className="flex flex-col gap-3">
      {/* Stale banner — still reveals the artifact, but flags it as behind the current slate/version. */}
      {view.status === "stale" ? (
        <div
          className="flex flex-col gap-0.5 rounded-[12px] px-3.5 py-2.5"
          style={{ background: "rgba(217,164,65,0.10)", border: "1px solid var(--vault-gold-bright)" }}
        >
          <Eyebrow>Stale simulation</Eyebrow>
          <span style={{ color: "var(--vault-text-mute)", fontSize: 11.5, lineHeight: 1.5 }}>
            This precomputed simulation is older than the current slate or model version. It is shown for reference — the numbers may be behind the latest board.
          </span>
        </div>
      ) : null}

      {/* Before click: the premium pre-sim "Generate card" — headline, explanation, a locked dashboard-
          preview pill row (LABELS ONLY, never data), then the prominent Generate button. The dense report,
          posted prices, prop tables, distributions, and price tabs are GATED behind the reveal (they live
          in `postReveal`, rendered only in the done phase) so nothing priced is in this pre-click DOM. */}
      {phase === "idle" ? (
        <div
          className="relative overflow-hidden flex flex-col gap-4 rounded-[16px] px-5 py-6 sm:px-6"
          style={{
            border: "1px solid var(--vault-border-strong)",
            background:
              "radial-gradient(120% 150% at 0% 0%, rgba(217,164,65,0.12) 0%, transparent 55%), linear-gradient(135deg, rgba(22,30,62,0.95) 0%, rgba(26, 16, 11,0.98) 100%)",
            boxShadow: "0 18px 48px -24px rgba(0,0,0,0.7)",
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Eyebrow>Model simulation</Eyebrow>
            <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 21, fontWeight: 800, lineHeight: 1.08 }}>
              {view.allowsRunCountClaim && view.runCount != null
                ? `Generate the ${view.runCount.toLocaleString()}-run simulation`
                : "Generate the model simulation"}
            </h2>
            <span style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.55 }}>
              precomputed model artifact · same result for every user · the dashboard unlocks after the reveal · paper-only
            </span>
          </div>

          {/* dashboard preview — LOCKED labels only (no numbers, no picks). What the reveal will unlock. */}
          <div className="flex flex-col gap-2">
            <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
              Unlocks after the reveal
            </span>
            <div className="flex flex-wrap gap-1.5">
              {DASHBOARD_PREVIEW_PILLS.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono uppercase tracking-[0.08em]"
                  style={{ background: "rgba(0,0,0,0.28)", border: "1px solid var(--vault-rule)", color: "var(--vault-text-faint)", fontSize: 9.5 }}
                >
                  <span aria-hidden style={{ fontSize: 9 }}>🔒</span>
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>
              <span style={{ color: "var(--vault-text-mute)" }}>Model</span> {dash(view.modelVersion)}
            </span>
            {view.allowsRunCountClaim && view.runCount != null ? (
              <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>
                <span style={{ color: "var(--vault-text-mute)" }}>Runs</span> {view.runCount.toLocaleString()}
              </span>
            ) : null}
            <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>
              {freshnessLabel(view.generatedAt)}
            </span>
          </div>
          <button
            type="button"
            onClick={start}
            className="gtp-cta-lava vault-press inline-flex items-center self-start rounded-full px-5 font-mono uppercase tracking-[0.12em]"
            style={{ fontSize: 12, fontWeight: 700, minHeight: 44, border: "none", cursor: "pointer" }}
          >
            Generate Simulation
          </button>
        </div>
      ) : null}

      {/* Reveal animation — the 10s sport-specific staging (premium baseball diamond + team marks for MLB).
          The dashboard is gated on SIMULATION_MIN_DURATION_MS in `start`, so it never appears before the
          animation finishes. Team logos are threaded through (monogram fallback when null). */}
      {phase === "revealing" ? <SportSimulationAnimation sport={view.sport} view={view} stage={stage} homeLogo={homeLogo} awayLogo={awayLogo} /> : null}

      {/* After reveal: the precomputed artifact, reorganized into the 10-section dashboard. */}
      {phase === "done" ? (
        <div className="flex flex-col gap-4">
          {/* 1 · HEADER — the summary (badge, matchup, model/runs/freshness, headline). Projected numbers
              are labelled explicitly as a MODEL PROJECTION, never a final/actual score. */}
          <section
            className="flex flex-col gap-2 rounded-[14px] px-5 py-4"
            style={{ border: "1px solid var(--vault-border-strong)", background: "linear-gradient(135deg, rgba(22,30,62,0.9) 0%, rgba(26, 16, 11,0.96) 100%)" }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.12em]"
                style={{ color: "var(--vault-gold-bright)", border: "1px solid var(--vault-rule)", fontSize: 9, background: "rgba(217,164,65,0.10)" }}
              >
                Simulation complete
              </span>
              <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
                Precomputed for this game
              </span>
            </div>
            {view.teams ? (
              <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 800, lineHeight: 1.1 }}>
                {dash(view.teams.away)} <span style={{ color: "var(--vault-text-faint)" }}>@</span> {dash(view.teams.home)}
              </h2>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono" style={{ fontSize: 10 }}>
              <span style={{ color: "var(--vault-text-faint)" }}><span style={{ color: "var(--vault-text-mute)" }}>Model</span> {dash(view.modelVersion)}</span>
              {view.allowsRunCountClaim && view.runCount != null ? (
                <span style={{ color: "var(--vault-text-faint)" }}><span style={{ color: "var(--vault-text-mute)" }}>Runs</span> {view.runCount.toLocaleString()}</span>
              ) : null}
              <span style={{ color: "var(--vault-text-faint)" }}>{freshnessLabel(view.generatedAt)}</span>
            </div>
            {view.simulationSummary?.headline ? (
              <p style={{ color: "var(--vault-text)", fontSize: 13.5, lineHeight: 1.5 }}>{dash(view.simulationSummary.headline)}</p>
            ) : null}
            {view.simulationSummary?.projectedTotal != null ||
            view.simulationSummary?.projectedHomeScore != null ||
            view.simulationSummary?.projectedAwayScore != null ? (
              <div className="flex flex-col gap-1">
                <Eyebrow color="var(--vault-text-faint)">Model projection · not a final score</Eyebrow>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {view.simulationSummary?.projectedTotal != null ? (
                    <Stat label="Proj total" value={num2(view.simulationSummary.projectedTotal)} />
                  ) : null}
                  {view.simulationSummary?.projectedHomeScore != null ? (
                    <Stat label="Proj home" value={num2(view.simulationSummary.projectedHomeScore)} />
                  ) : null}
                  {view.simulationSummary?.projectedAwayScore != null ? (
                    <Stat label="Proj away" value={num2(view.simulationSummary.projectedAwayScore)} />
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>

          {/* 2 · PRICED PROP SNAPSHOT — the market-snapshot analogue (priced picks only). */}
          <PricedPropSnapshot picks={view.generatedPicks} />

          {/* 3 · CENTRAL READ — the model's single strongest lean, as a PROP read (never a score). */}
          <CentralRead view={view} />

          {/* 4 · MAIN TAKEAWAYS — derived, deterministic cards from real fields. */}
          <MainTakeaways picks={view.generatedPicks} />

          {/* 5 · BIGGEST LEANS — the reused generated-picks grid (top-6 capped, honestly noted). */}
          {view.generatedPicks.length > 0 ? (
            <section className="flex flex-col gap-2.5">
              <div className="flex flex-col gap-0.5">
                <Eyebrow>Biggest leans · {view.generatedPicks.length}</Eyebrow>
                <h3 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>
                  What the {runCopy} produced
                </h3>
                <span style={{ color: "var(--vault-text-faint)", fontSize: 11.5 }}>
                  {view.generatedPicks.length > 6
                    ? `Showing top 6 of ${view.generatedPicks.length} generated picks — model probability vs the market price, with edge, per pick. Paper-only, deterministic.`
                    : "Model probability vs the market price, with edge, per pick — paper-only, deterministic."}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {view.generatedPicks.slice(0, 6).map((p, i) => (
                  <GeneratedPickCard key={p.id} p={p} top={i === 0} />
                ))}
              </div>
            </section>
          ) : (
            <div className="rounded-[12px] px-4 py-3.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed var(--vault-border)" }}>
              <p className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
                The simulation produced no qualified pick for this game — nothing is padded to look active.
              </p>
            </div>
          )}

          {/* 6 · PLAYER / PROP TABLE — the full ledger of generated picks (scrollable, capped). */}
          <PropTable picks={view.generatedPicks} />

          {/* 7 · DISTRIBUTION LAYER — reused, ONLY when the artifact carries a real, non-empty block. */}
          {view.distributions && Object.keys(view.distributions).length > 0 ? (
            <section className="flex flex-col gap-2.5">
              <div className="flex flex-col gap-0.5">
                <Eyebrow>Distributions</Eyebrow>
                <span style={{ color: "var(--vault-text-faint)", fontSize: 11.5 }}>
                  The simulated outcome spread — deterministic bins from the artifact.
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(view.distributions).map(([key, d]) => (
                  <DistributionCard key={key} d={d} />
                ))}
              </div>
            </section>
          ) : null}

          {/* 8 · CURRENT-SLATE MARKET AGREEMENT — hidden when zero priced picks. NOT calibration. */}
          <MarketAgreement picks={view.generatedPicks} />

          {/* 9 · UNAVAILABLE MODULES — reused honest "not generated" states. */}
          <UnavailableModules view={view} />

          {/* 10 · RECAP — copyable plain-text recap from real fields only. */}
          <RecapBlock view={view} />

          {/* Same-output note + paper-only. */}
          <p className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
            Same model output for every user · {versionNote}
          </p>
          <p className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
            Paper-only · educational · not betting advice
          </p>

          {/* GATED CONTENT — the dense report, Model spotlight, and price tabs. Rendered ONLY here (done),
              never as a pre-click sibling, so posted prices/prop tables/distributions are ABSENT until the
              reveal completes. */}
          {postReveal ? <div className="flex flex-col gap-5 mt-1">{postReveal}</div> : null}

          {/* Post-reveal navigation — back to the lobby, another game, or today's picks. */}
          <nav className="mt-1 flex flex-wrap items-center gap-2" aria-label="After the simulation">
            <Link
              href="/simulate"
              className="vault-press inline-flex items-center rounded-full px-4 font-mono uppercase tracking-[0.12em]"
              style={{ border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", fontSize: 11, textDecoration: "none", minHeight: 40 }}
            >
              ← Back to all simulations
            </Link>
            <Link
              href="/simulate"
              className="vault-press inline-flex items-center rounded-full px-4 font-mono uppercase tracking-[0.12em]"
              style={{ border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", fontSize: 11, textDecoration: "none", minHeight: 40 }}
            >
              Try another game
            </Link>
            <Link
              href="/today"
              className="vault-press inline-flex items-center rounded-full px-4 font-mono uppercase tracking-[0.12em]"
              style={{ border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", fontSize: 11, textDecoration: "none", minHeight: 40 }}
            >
              See today&apos;s picks
            </Link>
          </nav>
        </div>
      ) : null}
    </section>
  );
}
