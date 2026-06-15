"use client";

/**
 * UfcExpandedFightCards — fight-by-fight expandable projection cards for a UFC event.
 *
 * Honesty: the moneyline leg is odds-backed (real sportsbook line + model + edge). The
 * expanded projections (goes-the-distance, total rounds, method of victory) are MODEL-ONLY
 * — derived from real fighter finish/method history, with NO sportsbook odds in the feed —
 * so every expanded row carries a "model-only · not parlay eligible" badge. Fights with
 * thin fighter data show an honest "limited data" state, never an invented projection.
 */
import { useState } from "react";

type MarketState = "odds-backed" | "model-only" | "unavailable";

interface FStats {
  record?: string; last5?: string; last5FightCount?: number; finishRate?: number | null;
  heightInches?: number | null; reachInches?: number | null; stance?: string | null; ageYears?: number | null;
  sigStrPerRound?: number | null; takedownsPerRound?: number | null; dataCompleteness?: number | null;
}

interface Fight {
  boutId?: string;
  fighters: string[];
  scheduledRounds?: number;
  note?: string;
  fighterStats?: Record<string, FStats | null>;
  moneyline?: { pick: string; modelProbability: number; oddsPrice?: number; marketProbability?: number; edge?: number; marketState: MarketState };
  goesDistance?: { yesProbability: number; noProbability: number; lean: string; confidence: string; marketState: MarketState; parlayEligible: boolean };
  totalRounds?: { projectedRounds: number; referenceLine: number; lean: string; confidence: string; marketState: MarketState; parlayEligible: boolean };
  method?: {
    koTkoProbability: number; submissionProbability: number; decisionProbability: number; topMethod: string;
    perFighter?: Record<string, { koTko: number; submission: number; decision: number }>;
    confidence: string; marketState: MarketState; parlayEligible: boolean;
  };
  rationale?: string[];
  dataQuality?: string;
}

const pct = (x?: number) => (typeof x === "number" ? `${Math.round(x * 100)}%` : "—");
const fmtAmerican = (p?: number) => (typeof p === "number" ? (p > 0 ? `+${p}` : `${p}`) : "—");

function StateBadge({ state }: { state: MarketState }) {
  const map: Record<MarketState, { c: string; bg: string; b: string; label: string }> = {
    "odds-backed": { c: "var(--vault-success)", bg: "rgba(110,231,168,0.14)", b: "rgba(110,231,168,0.35)", label: "ODDS-BACKED" },
    "model-only": { c: "var(--gtp-bank-heat)", bg: "var(--gtp-bank-heat-dim)", b: "rgba(255,122,60,0.32)", label: "MODEL-ONLY · NOT PARLAY ELIGIBLE" },
    unavailable: { c: "var(--vault-text-faint)", bg: "rgba(26,16,11,0.6)", b: "var(--vault-rule)", label: "UNAVAILABLE" },
  };
  const t = map[state];
  return (
    <span className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.08em]" style={{ color: t.c, background: t.bg, border: `1px solid ${t.b}` }}>
      {t.label}
    </span>
  );
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
}

/** No real fighter-image source is connected, so we render a polished initials disc —
 *  never a fabricated or borrowed photo (per the integrity rules). */
function FighterAvatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, background: "rgba(255,122,60,0.14)", border: "1px solid var(--lava-border-strong)", color: "var(--gtp-bank-heat)", fontSize: size * 0.36, fontWeight: 700 }}
      role="img"
      aria-label={name}
    >
      {initials(name)}
    </span>
  );
}

function CompareCol({ name, s }: { name: string; s?: FStats | null }) {
  const lines: string[] = [];
  if (s?.record) lines.push(`Record ${s.record}`);
  if (s?.reachInches) lines.push(`${s.reachInches}" reach`);
  if (s?.stance) lines.push(s.stance);
  if (typeof s?.sigStrPerRound === "number") lines.push(`${s.sigStrPerRound} sig str/rd`);
  if (typeof s?.takedownsPerRound === "number") lines.push(`${s.takedownsPerRound} TD/rd`);
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
      <FighterAvatar name={name} size={36} />
      <span className="truncate text-[12px] font-semibold" style={{ color: "var(--vault-text)", maxWidth: "100%" }}>{name}</span>
      <div className="flex flex-col gap-0.5">
        {lines.length ? lines.map((l, i) => (
          <span key={i} className="font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>{l}</span>
        )) : <span className="font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>stats limited</span>}
        <span className="font-mono text-[10px]" style={{ color: "var(--vault-text-mute)" }}>
          Last 5: {s?.last5 ?? "—"}
        </span>
      </div>
    </div>
  );
}

function MetricRow({ label, value, sub, state }: { label: string; value: string; sub?: string; state: MarketState }) {
  return (
    <div className="rounded-[8px] px-3 py-2.5" style={{ background: "rgba(12,8,6,0.5)", border: "1px solid var(--vault-rule)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)" }}>{label}</span>
        <StateBadge state={state} />
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-display tabular" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>{value}</span>
        {sub ? <span className="font-mono text-[11px]" style={{ color: "var(--vault-text-mute)" }}>{sub}</span> : null}
      </div>
    </div>
  );
}

function FightRow({ f }: { f: Fight }) {
  const [open, setOpen] = useState(false);
  const hasExpanded = Boolean(f.method && f.goesDistance && f.totalRounds);
  const ml = f.moneyline;
  return (
    <li className="overflow-hidden rounded-[10px]" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="flex shrink-0 -space-x-1.5">
          <FighterAvatar name={f.fighters[0]} />
          <FighterAvatar name={f.fighters[1]} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold" style={{ color: "var(--vault-text)", fontSize: 14 }}>
            {f.fighters[0]} <span style={{ color: "var(--vault-text-faint)" }}>vs</span> {f.fighters[1]}
          </span>
          <span className="font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
            {ml ? `Model pick: ${ml.pick} · ${pct(ml.modelProbability)}` : "Moneyline pending"}
            {f.scheduledRounds ? ` · ${f.scheduledRounds}-round` : ""}
          </span>
        </div>
        {ml ? <span className="font-mono tabular shrink-0" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>{fmtAmerican(ml.oddsPrice)}</span> : null}
        <span aria-hidden className="shrink-0 font-mono" style={{ color: "var(--gtp-bank-heat)", fontSize: 13, transform: open ? "rotate(90deg)" : "none", transition: "transform 120ms" }}>›</span>
      </button>

      {open ? (
        <div className="flex flex-col gap-2 px-4 pb-4">
          {f.fighterStats ? (
            <div className="rounded-[8px] px-3 py-3" style={{ background: "rgba(12,8,6,0.5)", border: "1px solid var(--vault-rule)" }}>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)" }}>Fighter comparison</span>
                <span className="font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)" }}>real fighter data</span>
              </div>
              <div className="flex items-start gap-2">
                <CompareCol name={f.fighters[0]} s={f.fighterStats[f.fighters[0]]} />
                <span className="self-center font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>vs</span>
                <CompareCol name={f.fighters[1]} s={f.fighterStats[f.fighters[1]]} />
              </div>
              <p className="mt-2 text-center font-mono text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>
                Records + last-5 W-L from the connected fighter database. Detailed bout-by-bout history (opponent/method/date) is unavailable from the connected source.
              </p>
            </div>
          ) : null}
          {!hasExpanded ? (
            <p className="text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
              {f.note ?? "Expanded projections unavailable for this fight — limited fighter data. Moneyline only."}
            </p>
          ) : (
            <>
              {ml ? (
                <MetricRow
                  label="Moneyline"
                  value={`${ml.pick} ${pct(ml.modelProbability)}`}
                  sub={`${fmtAmerican(ml.oddsPrice)} · market ${pct(ml.marketProbability)} · edge ${(ml.edge ?? 0) >= 0 ? "+" : ""}${Math.round((ml.edge ?? 0) * 1000) / 10}pp`}
                  state="odds-backed"
                />
              ) : null}
              <MetricRow
                label="Goes the distance"
                value={f.goesDistance!.lean === "yes" ? `Yes · ${pct(f.goesDistance!.yesProbability)}` : `No · ${pct(f.goesDistance!.noProbability)}`}
                sub={`yes ${pct(f.goesDistance!.yesProbability)} / no ${pct(f.goesDistance!.noProbability)} · ${f.goesDistance!.confidence} conf`}
                state="model-only"
              />
              <MetricRow
                label={`Total rounds (O/U ${f.totalRounds!.referenceLine})`}
                value={`${f.totalRounds!.lean} · ${f.totalRounds!.projectedRounds} rds`}
                sub={`${f.totalRounds!.confidence} conf`}
                state="model-only"
              />
              <MetricRow
                label="Method of victory"
                value={f.method!.topMethod}
                sub={`KO/TKO ${pct(f.method!.koTkoProbability)} · sub ${pct(f.method!.submissionProbability)} · dec ${pct(f.method!.decisionProbability)}`}
                state="model-only"
              />
              {f.rationale?.length ? (
                <ul className="mt-0.5 flex flex-col gap-1">
                  {f.rationale.map((r, i) => (
                    <li key={i} className="text-[11px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>· {r}</li>
                  ))}
                </ul>
              ) : null}
              <p className="font-mono text-[9.5px] uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)" }}>
                Expanded markets are model-only (no book odds connected) — not parlay eligible. Paper-only.
              </p>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

export default function UfcExpandedFightCards({ fights }: { fights: Fight[] }) {
  if (!fights?.length) {
    return <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>Expanded fight projections appear once the card and fighter stats are loaded.</p>;
  }
  return <ol className="flex flex-col gap-2">{fights.map((f, i) => <FightRow key={f.boutId ?? i} f={f} />)}</ol>;
}
