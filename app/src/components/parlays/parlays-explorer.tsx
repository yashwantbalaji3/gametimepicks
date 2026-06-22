"use client";
/**
 * Parlays explorer — mobile-first showcase of the methodology engine output: suggested parlays by
 * sport + risk level, game-specific parlays, the eligible-leg marketplace, and honest no-qualified
 * states. Reads engine display data (props) — never fabricates a card.
 */
import { useState } from "react";
import Link from "next/link";
import PlayerAvatar from "@/components/player-avatar";
import TeamLogo from "@/components/team-logo";
import FlagBadge from "@/components/flag-badge";
import type {
  TodaySlateView, SuggestedParlayCard, ParlayLegDisplay, SportSlateStatus,
} from "@/lib/parlays/ui-loader";
import type { RiskLevel } from "@/lib/parlays/types";
import { RISK_LABELS } from "@/lib/parlays/risk-taxonomy";
import { buildCardFactoryDiagnostics } from "@/lib/parlays/card-factory-diagnostics";
import type { CoverageMatrix as CoverageMatrixData, CoverageCell } from "@/lib/parlays/coverage-matrix";

const RISK_LABEL: Record<RiskLevel, string> = RISK_LABELS;
const RISK_ORDER: RiskLevel[] = ["low", "medium", "high", "longshot"];
// Map a sport tab to its diagnostics scope.
const SCOPE_FOR: Record<string, "world_cup_multi_game" | "mlb" | "mixed"> = { WORLD_CUP: "world_cup_multi_game", MLB: "mlb", MIXED: "mixed" };
const SPORT_LABEL: Record<string, string> = { MLB: "MLB", NBA: "NBA", UFC: "UFC", WORLD_CUP: "World Cup" };

function americanStr(o: number | null): string {
  if (o == null) return "—";
  return o > 0 ? `+${o}` : `${o}`;
}
function pctStr(p: number | null): string {
  return p == null ? "—" : `${Math.round(p * 100)}%`;
}

function LegIdentity({ leg, size = "sm" }: { leg: ParlayLegDisplay; size?: "xs" | "sm" | "md" }) {
  const id = leg.identity;
  if (id.kind === "player" && id.playerId != null) {
    return <PlayerAvatar playerId={id.playerId} playerName={leg.participant} team={id.teamAbbr ?? undefined} sport={id.avatarSport} size={size} flat />;
  }
  if (id.kind === "player" && id.photoUrl) {
    // World Cup photo (API-Football) — plain img with graceful fallback to a flag/initial.
    return <img src={id.photoUrl} alt={leg.participant} width={size === "md" ? 44 : 32} height={size === "md" ? 44 : 32} loading="lazy" className="rounded-full object-cover" style={{ width: size === "md" ? 44 : 32, height: size === "md" ? 44 : 32 }} />;
  }
  if (leg.sport === "WORLD_CUP" && id.countryCode) {
    return <FlagBadge code={id.countryCode} size={size === "md" ? "lg" : "md"} ariaLabel={leg.participant} />;
  }
  if (id.kind === "team" && id.teamAbbr && (leg.sportKey === "mlb" || leg.sportKey === "nba")) {
    return <TeamLogo team={id.teamAbbr} sport={leg.sportKey} size={size === "md" ? "md" : "sm"} />;
  }
  // Fallback monogram (UFC fighters, missing ids) — never a fabricated photo.
  return <PlayerAvatar playerName={leg.participant} size={size} flat />;
}

function Chip({ label, tone = "mute" }: { label: string; tone?: "mute" | "good" | "warn" | "text" }) {
  const color = tone === "good" ? "var(--vault-success)" : tone === "warn" ? "var(--gtp-bank-heat)" : tone === "text" ? "var(--vault-text)" : "var(--vault-text-faint)";
  return (
    <span className="inline-flex items-center rounded-[5px] px-1.5 py-0.5 font-mono text-[11px]" style={{ color, background: "rgba(255,255,255,0.04)", border: "1px solid var(--vault-border)" }}>
      {label}
    </span>
  );
}

/** Real last-5 prop grid (official MLB game logs) — green hit / red miss vs the exact line. */
function Last5Mini({ leg }: { leg: ParlayLegDisplay }) {
  const l5 = leg.last5;
  if (!l5) return null;
  if (l5.unavailable) return <div className="font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>Last 5: data unavailable</div>;
  const games = l5.games ?? [];
  return (
    <div className="rounded-lg px-2 py-1.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--vault-border)" }}>
      <div className="flex items-center justify-between font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>
        <span>Last 5 · {l5.stat === "strikeouts" ? "K" : "H+R+RBI"} vs {leg.side ? `${leg.side[0].toUpperCase()}${leg.side.slice(1)}` : ""} {l5.line}</span>
        {l5.hitRate && <span style={{ color: l5.hitRate.pct >= 60 ? "var(--vault-success)" : "var(--vault-text-mute)" }}>{l5.hitRate.hits}/{l5.hitRate.total} · {l5.hitRate.pct}%</span>}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {games.map((g, i) => (
          <span key={i} title={`${g.date} vs ${g.opp}: ${g.value}`} className="flex h-6 min-w-[26px] items-center justify-center rounded font-mono text-[11px]"
            style={{ background: g.hit ? "rgba(70,130,90,0.22)" : "rgba(225,29,42,0.15)", color: g.hit ? "var(--vault-success)" : "var(--gtp-bank-heat)", border: "1px solid var(--vault-border)" }}>{g.value}</span>
        ))}
      </div>
    </div>
  );
}

/** A clickable leg: identity + exact market/side/line + odds, expands to model/last-5/settlement detail. */
function shortStartUtc(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" }) + " UTC";
}

function LegRow({ leg }: { leg: ParlayLegDisplay }) {
  const settlesNote = leg.sport === "WORLD_CUP"
    ? "Settles on the 90-minute regulation result (official). Limited-data: market-implied."
    : "Settles from the official box score. No plate appearance / did-not-pitch → void (no action).";
  // Matchup line: opponent + kickoff so every leg (esp. World Cup player props) shows who + when.
  const matchup = [leg.opponent ? `vs ${leg.opponent}` : null, shortStartUtc(leg.startTime)].filter(Boolean).join(" · ");
  return (
    <details className="py-2" style={{ borderTop: "1px solid var(--vault-border)" }}>
      <summary className="flex items-start gap-2.5 cursor-pointer" style={{ listStyle: "none" }}>
        <div className="shrink-0 pt-0.5"><LegIdentity leg={leg} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[13.5px] font-medium truncate" style={{ color: "var(--vault-text)" }}>{leg.participant}</span>
            <span className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>{leg.market}{leg.side ? ` ${leg.side[0].toUpperCase()}${leg.side.slice(1)}` : ""}{leg.line != null ? ` ${leg.line}` : ""}</span>
            <span className="font-mono text-[12.5px]" style={{ color: "var(--vault-text)" }}>{americanStr(leg.odds)}</span>
            <span className="font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>▾</span>
          </div>
          {matchup && <div className="font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>{matchup}</div>}
          {/* Summary chips trimmed to the two most meaningful (confidence + edge); model%, implied%,
              quality and survival live in the expanded detail below to cut badge clutter. */}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Chip label={leg.confidenceTier} tone={leg.confidenceTier === "High" ? "good" : leg.confidenceTier === "No Bet" ? "warn" : "mute"} />
            {leg.edge != null && <Chip label={`${leg.edge >= 0 ? "+" : ""}${leg.edge.toFixed(1)}pp`} tone={leg.edge > 0 ? "good" : "mute"} />}
          </div>
        </div>
      </summary>
      <div className="mt-2 space-y-1.5 pl-8 text-[11.5px]">
        <div className="flex flex-wrap gap-1.5 font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
          {leg.modelProbability != null && <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)" }}>model {pctStr(leg.modelProbability)}</span>}
          {leg.marketImpliedProbability != null && <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)" }}>implied {pctStr(leg.marketImpliedProbability)}</span>}
          {leg.edge != null && <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)", color: leg.edge > 0 ? "var(--vault-success)" : "var(--vault-text-faint)" }}>{leg.edge >= 0 ? "+" : ""}{leg.edge.toFixed(1)}pp edge</span>}
          {leg.survivalScore != null && <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)" }}>survival {leg.survivalScore}</span>}
          <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)" }}>risk {leg.riskScore.toFixed(2)}</span>
        </div>
        {leg.last5 && <Last5Mini leg={leg} />}
        {leg.topPositiveFactors[0] && <div style={{ color: "var(--vault-text-mute)" }}><span style={{ color: "var(--vault-success)" }}>Why:</span> {leg.topPositiveFactors[0]}</div>}
        {leg.topNegativeFactors[0] && <div style={{ color: "var(--vault-text-mute)" }}><span style={{ color: "var(--gtp-bank-heat)" }}>Risk:</span> {leg.topNegativeFactors[0]}</div>}
        {(leg.missingFlags.length > 0 || leg.staleFlags.length > 0) && (
          <div style={{ color: "var(--vault-text-faint)" }}>flags: {[...leg.missingFlags.map((f) => `missing ${f}`), ...leg.staleFlags.map((f) => `stale ${f}`)].join(" · ")}</div>
        )}
        <div style={{ color: "var(--vault-text-faint)" }}>{settlesNote}</div>
      </div>
    </details>
  );
}

export function ParlayCard({ card }: { card: SuggestedParlayCard }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--vault-surface, rgba(255,255,255,0.02))", border: "1px solid var(--vault-border)", borderTop: "2px solid var(--gtp-bank-heat)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Chip label={RISK_LABEL[card.riskLevel]} tone="text" />
          <Chip label={card.sport === "MIXED" ? "Mixed" : SPORT_LABEL[card.sport] ?? card.sport} />
          {card.parlayType === "same_game" && <Chip label="same game" />}
        </div>
        <div className="text-right">
          {/* Sportsbook-style price: the combined odds are the headline of the ticket. */}
          <span className="inline-block rounded-[8px] px-2.5 py-1 font-mono font-bold tabular" style={{ fontSize: 17, color: "var(--vault-gold-bright)", background: "var(--vault-gold-dim)", border: "1px solid color-mix(in srgb, var(--vault-gold-bright) 45%, transparent)" }}>{americanStr(card.combinedOdds)}</span>
          <div className="mt-1 text-[11px]" style={{ color: "var(--vault-text-faint)" }}>model {pctStr(card.estimatedHitProbability)} · {card.legs.length} legs</div>
        </div>
      </div>
      <div className="mt-2">
        {card.legs.map((l) => <LegRow key={l.legId} leg={l} />)}
      </div>
      {(() => {
        const hasPlayerProp = card.legs.some((l) => /Goalscorer|Shots on Target|Assists|Shots/.test(l.market) && l.sport === "WORLD_CUP");
        const correlated = card.parlayType === "same_game" || (card.correlationScore != null && card.correlationScore >= 0.35);
        const anything = card.whyThisParlay[0] || card.whyItCouldFail[0] || card.correlationSummary || hasPlayerProp;
        if (!anything) return null;
        return (
          <div className="mt-2 space-y-1 text-[12px]" style={{ borderTop: "1px solid var(--vault-border)", paddingTop: 8 }}>
            {card.whyThisParlay[0] && <div style={{ color: "var(--vault-text-mute)" }}><span style={{ color: "var(--vault-success)" }}>Why:</span> {card.whyThisParlay[0]}</div>}
            {card.whyItCouldFail[0] && <div style={{ color: "var(--vault-text-mute)" }}><span style={{ color: "var(--gtp-bank-heat)" }}>Risk:</span> {card.whyItCouldFail[0]}</div>}
            {(correlated || card.correlationSummary) && (
              <div style={{ color: "var(--vault-text-faint)" }}><span className="font-mono text-[10px] uppercase">correlation:</span> {card.correlationSummary || (card.parlayType === "same_game" ? "Same-game stack — outcomes are intentionally correlated (high-volatility). Disclosed, not hidden." : "low cross-game correlation")}</div>
            )}
            {hasPlayerProp && <div style={{ color: "var(--vault-text-faint)" }}>Includes limited-data / market-implied player props (lineups not yet posted). Settles from official sources.</div>}
          </div>
        );
      })()}
    </div>
  );
}

function NoQualified({ status }: { status: SportSlateStatus }) {
  return (
    <div className="rounded-xl p-4 text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed var(--vault-border)" }}>
      <div className="text-[13px] font-medium" style={{ color: "var(--vault-text)" }}>No Qualified Parlays</div>
      <div className="mt-1 text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>{status.noQualified?.message}</div>
      <div className="mt-1 font-mono text-[11px]" style={{ color: "var(--vault-text-faint)" }}>extractor: {status.extractorStatus} · candidates: {status.totalCandidates}</div>
    </div>
  );
}

function Accordion({ title, subtitle, children, defaultOpen = false }: { title: string; subtitle?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--vault-border)" }}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-3.5 py-3 text-left" style={{ background: "rgba(255,255,255,0.02)" }}>
        <span>
          <span className="text-[13.5px] font-medium" style={{ color: "var(--vault-text)" }}>{title}</span>
          {subtitle && <span className="ml-2 text-[12px]" style={{ color: "var(--vault-text-faint)" }}>{subtitle}</span>}
        </span>
        <span aria-hidden style={{ color: "var(--vault-text-faint)" }}>{open ? "−" : "+"}</span>
      </button>
      {open && <div className="space-y-3 p-3">{children}</div>}
    </div>
  );
}

/** Readable card-coverage grid: every sport (+ Mixed) × every risk level, with counts. Makes it
 *  obvious which risk levels actually have cards today vs which are empty — no guessing from tabs. */
const STATUS_DOT: Record<"filled" | "underfilled" | "empty", string> = {
  filled: "#6EE7A8", underfilled: "var(--vault-gold-bright)", empty: "var(--vault-text-faint)",
};

function CoverageMatrix({ data }: { data?: CoverageMatrixData }) {
  if (!data || data.rows.length === 0) return null;
  const RB = ["low", "medium", "high", "longshot"] as const;
  const cell = (c: CoverageCell | undefined) => (
    <td key={c?.risk} className="px-2 py-1.5 text-center font-mono tabular" style={{ fontSize: 12 }}
      title={c && c.count === 0 ? c.message : undefined}>
      <span style={{ color: c && c.count > 0 ? "var(--vault-text)" : "var(--vault-text-faint)", opacity: c && c.count > 0 ? 1 : 0.55 }}>{c?.count ?? 0}</span>
      {c && c.count === 0 && c.status === "empty" ? <sup style={{ color: "var(--vault-text-faint)", fontSize: 8 }}> ⓘ</sup> : null}
    </td>
  );
  // Empty-bucket reasons grouped for the diagnostics drawer.
  const emptyReasons = data.rows.flatMap((r) => r.cells.filter((c) => c.count === 0 && c.scope !== "moonshot" && c.scope !== "bank_builder").map((c) => `${r.displayName} · ${c.label}: ${c.message}`));
  return (
    <Accordion title="Suggested parlay coverage" subtitle={`${data.grandTotal} model-built cards today, by scope × risk`} defaultOpen>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full border-collapse" style={{ minWidth: 420 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--vault-border)" }}>
              <th className="sticky left-0 px-2 py-1.5 text-left font-mono uppercase tracking-wide" style={{ color: "var(--vault-text-faint)", fontSize: 10, background: "var(--lava-panel, #14100c)" }}>Scope</th>
              {(["Low Risk", "Medium Risk", "High Risk", "Longshot"]).map((l) => (
                <th key={l} className="px-2 py-1.5 text-center font-mono uppercase tracking-wide" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{l}</th>
              ))}
              <th className="px-2 py-1.5 text-center font-mono uppercase tracking-wide" style={{ color: "var(--vault-text-mute)", fontSize: 10 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.scope} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <td className="sticky left-0 px-2 py-1.5 text-left" style={{ fontSize: 12.5, fontWeight: 600, background: "var(--lava-panel, #14100c)" }}>
                  <Link href={r.href} style={{ color: "var(--vault-text)", textDecoration: "none" }}>{r.displayName}</Link>
                </td>
                {RB.map((rb) => cell(r.cells.find((c) => c.risk === rb)))}
                <td className="px-2 py-1.5 text-center font-mono tabular" style={{ color: "var(--vault-gold-bright)", fontSize: 12, fontWeight: 700 }}>{r.total}</td>
              </tr>
            ))}
            <tr style={{ borderTop: "2px solid var(--vault-border)" }}>
              <td className="sticky left-0 px-2 py-1.5 text-left font-mono uppercase tracking-wide" style={{ color: "var(--vault-text-mute)", fontSize: 10, background: "var(--lava-panel, #14100c)" }}>Total</td>
              {RB.map((rb) => <td key={rb} className="px-2 py-1.5 text-center font-mono tabular" style={{ color: "var(--vault-text)", fontSize: 12, fontWeight: 700 }}>{data.riskTotals[rb]}</td>)}
              <td className="px-2 py-1.5 text-center font-mono tabular" style={{ color: "var(--vault-gold-bright)", fontSize: 13, fontWeight: 800 }}>{data.grandTotal}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono" style={{ color: "var(--vault-text-faint)" }}>
        {(["filled", "underfilled", "empty"] as const).map((s) => <span key={s} className="inline-flex items-center gap-1"><span style={{ width: 7, height: 7, borderRadius: 99, background: STATUS_DOT[s], display: "inline-block" }} />{s}</span>)}
        <span>· Moonshot &amp; Core Bank Builder counted in their own rows only (no double-count).</span>
      </div>
      {emptyReasons.length ? (
        <details className="mt-2">
          <summary className="cursor-pointer font-mono text-[10.5px]" style={{ color: "var(--vault-gold-bright)", listStyle: "none" }}>Why are some buckets empty? · {emptyReasons.length} ▾</summary>
          <ul className="mt-1 flex flex-col gap-0.5">
            {data.diagnosticsSummary.map((s, i) => <li key={`s${i}`} className="text-[11px]" style={{ color: "var(--vault-text-mute)" }}>{s}</li>)}
            {emptyReasons.slice(0, 12).map((m, i) => <li key={`e${i}`} className="font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>· {m}</li>)}
          </ul>
        </details>
      ) : null}
    </Accordion>
  );
}

export default function ParlaysExplorer({ slate, coverage }: { slate: TodaySlateView; coverage?: CoverageMatrixData }) {
  const sportsWithLegs = slate.sports.filter((s) => s.eligibleCount > 0);
  const mixedTotal = RISK_ORDER.reduce((n, lvl) => n + (slate.mixedByRisk[lvl]?.length ?? 0), 0);
  // Default to World Cup when it has cards (the slate's headline sport), else the first sport with legs.
  const wcHasCards = (sportsWithLegs.find((s) => s.sport === "WORLD_CUP")?.eligibleCount ?? 0) > 0;
  const firstSport = wcHasCards ? "WORLD_CUP" : (sportsWithLegs[0] ?? slate.sports[0])?.sport ?? "MLB";
  const [sport, setSport] = useState<string>(firstSport);
  const [view, setView] = useState<"suggested" | "game" | "legs">("suggested");

  const isMixed = sport === "MIXED";
  const active = slate.sports.find((s) => s.sport === sport);
  const byRisk = isMixed ? slate.mixedByRisk : (slate.suggestedBySportRisk[sport] ?? {});
  const gameGroups = slate.gameSpecific.filter((g) => g.sport === sport);
  const sportLegs = slate.eligibleLegs.filter((l) => l.sport === sport);

  // Honest diagnostics — every empty bucket gets a real reason, never a vague empty state.
  const diag = buildCardFactoryDiagnostics(slate, slate.date);
  const emptyReason = (lvl: RiskLevel): string => {
    const scope = SCOPE_FOR[sport];
    return (scope && diag.matrix[scope]?.[lvl]?.message) || `No ${RISK_LABEL[lvl]} ${SPORT_LABEL[sport] ?? sport} card passed today's model gates.`;
  };
  const emptyCells = Object.values(diag.matrix).flatMap((s) => Object.values(s)).filter((c) => c.passed === 0);

  return (
    <div className="space-y-4">
      {/* Coverage at a glance: which sport × risk tiers actually have cards today. */}
      <CoverageMatrix data={coverage} />
      {/* Honest "why empty" diagnostics drawer — public-friendly reasons, never a vague empty state. */}
      {emptyCells.length ? (
        <details className="rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-border)" }}>
          <summary className="cursor-pointer px-3.5 py-2.5 text-[12.5px]" style={{ color: "var(--vault-text-mute)", listStyle: "none" }}>
            Why are some buckets empty? · {emptyCells.length} ▾
          </summary>
          <div className="px-3.5 pb-3 pt-0.5">
            <p className="mb-1.5 text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>{diag.summary}</p>
            <ul className="flex flex-col gap-0.5">
              {emptyCells.slice(0, 16).map((c) => (
                <li key={`${c.scope}-${c.bucket}`} className="font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>· {c.message}</li>
              ))}
            </ul>
          </div>
        </details>
      ) : null}
      {/* sport selector (+ Mixed when cross-sport cards exist) */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" style={{ scrollbarWidth: "none" }}>
        {slate.sports.map((s) => (
          <button key={s.sport} onClick={() => setSport(s.sport)}
            className="shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-medium"
            style={{
              background: s.sport === sport ? "var(--vault-gold-bright, #d9a441)" : "rgba(255,255,255,0.04)",
              color: s.sport === sport ? "#170f0a" : "var(--vault-text-mute)",
              border: "1px solid var(--vault-border)",
            }}>
            {SPORT_LABEL[s.sport] ?? s.sport}{s.eligibleCount > 0 ? ` · ${s.eligibleCount}` : ""}
          </button>
        ))}
        {mixedTotal > 0 && (
          <button onClick={() => setSport("MIXED")}
            className="shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-medium"
            style={{
              background: isMixed ? "var(--vault-gold-bright, #d9a441)" : "rgba(255,255,255,0.04)",
              color: isMixed ? "#170f0a" : "var(--vault-text-mute)",
              border: "1px solid var(--vault-border)",
            }}>
            Mixed · {mixedTotal}
          </button>
        )}
      </div>

      {isMixed ? (
        <div className="space-y-4">
          <p className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
            Cross-sport cards — each blends a World Cup leg with a leg from another game, from distinct, non-correlated games.
          </p>
          {RISK_ORDER.every((lvl) => (byRisk[lvl]?.length ?? 0) === 0) ? (
            <div className="rounded-xl p-4 text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed var(--vault-border)" }}>
              <div className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>No qualified cross-sport cards right now.</div>
            </div>
          ) : RISK_ORDER.map((lvl) => {
            const cards = byRisk[lvl] ?? [];
            if (cards.length === 0) return null;
            return (
              <div key={lvl} className="space-y-2.5">
                <div className="text-[12.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--vault-text-faint)" }}>{RISK_LABEL[lvl]} risk · {cards.length}</div>
                {cards.map((c) => <ParlayCard key={c.parlayId} card={c} />)}
              </div>
            );
          })}
        </div>
      ) : !active || active.eligibleCount === 0 ? (
        active ? <NoQualified status={active} /> : null
      ) : (
        <>
          {/* view tabs */}
          <div className="flex gap-2">
            {([["suggested", "Suggested"], ["game", `Same-game (${gameGroups.length})`], ["legs", `Legs (${sportLegs.length})`]] as const).map(([v, label]) => (
              <button key={v} onClick={() => setView(v)} className="rounded-lg px-3 py-1.5 text-[12.5px]"
                style={{ background: view === v ? "rgba(255,255,255,0.06)" : "transparent", color: view === v ? "var(--vault-text)" : "var(--vault-text-faint)", border: "1px solid var(--vault-border)" }}>
                {label}
              </button>
            ))}
          </div>

          {view === "suggested" && (
            <div className="space-y-4">
              {RISK_ORDER.map((lvl) => {
                const cards = byRisk[lvl] ?? [];
                return (
                  <div key={lvl} className="space-y-2.5">
                    <div className="text-[12.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--vault-text-faint)" }}>{RISK_LABEL[lvl]} risk · {cards.length}</div>
                    {cards.length > 0
                      ? cards.map((c) => <ParlayCard key={c.parlayId} card={c} />)
                      : <div className="rounded-lg px-3 py-2 text-[12px]" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed var(--vault-border)", color: "var(--vault-text-faint)" }}>{emptyReason(lvl)}</div>}
                  </div>
                );
              })}
            </div>
          )}

          {view === "game" && (
            <div className="space-y-3">
              {gameGroups.length === 0 && <div className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>No non-conflicting same-game parlays today.</div>}
              {gameGroups.map((g) => (
                <Accordion key={g.gameId} title={`Game ${g.label}`} subtitle={`${g.parlays.length} parlay${g.parlays.length === 1 ? "" : "s"}`}>
                  {g.parlays.map((c) => <ParlayCard key={c.parlayId} card={c} />)}
                </Accordion>
              ))}
            </div>
          )}

          {view === "legs" && (
            <Accordion title="Eligible-leg marketplace" subtitle={`${sportLegs.length} legs`} defaultOpen>
              {sportLegs.slice(0, 60).map((l) => (
                <div key={l.legId} className="rounded-lg px-2" style={{ background: "rgba(255,255,255,0.02)" }}><LegRow leg={l} /></div>
              ))}
              {sportLegs.length > 60 && <div className="text-center text-[12px]" style={{ color: "var(--vault-text-faint)" }}>+{sportLegs.length - 60} more eligible legs</div>}
            </Accordion>
          )}
        </>
      )}
    </div>
  );
}
