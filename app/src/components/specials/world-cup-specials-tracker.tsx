/**
 * WorldCupSpecialsTracker — the dedicated day-by-day World Cup Specials surface, mirroring the
 * Bank Builder + Moonshot trackers but for the model-ranked suggested longshot cards. Specials carry
 * NO placed exposure, so the record tracks officially-settled cards only and exposure is always $0.
 * Separate from Bank Builder core, Moonshot, Mr. Dub core record, and the protected crown.
 *
 * Server component; the host passes the loaded Specials result + nowIso (no fabrication, no settlement).
 */
import Link from "next/link";

import TicketCard from "@/components/tickets/ticket-card";
import LegRow, { type TicketLeg } from "@/components/tickets/leg-row";
import StatusPill, { type TicketStatus } from "@/components/tickets/status-pill";
import { normalizeLegResult } from "@/components/tickets/settlement-badge";
import { deriveSpecialsTracker, type SpecialsCardStatus } from "@/lib/world-cup/specials-tracker";
import type { WorldCupSpecialsResult, WorldCupSpecialCard, SpecialLeg } from "@/lib/world-cup/world-cup-specials";

function kickoffEt(startTime?: string | null): string | undefined {
  if (!startTime) return undefined;
  const t = Date.parse(startTime);
  if (!Number.isFinite(t)) return undefined;
  // ET (EDT = UTC-4) for the WC slate window.
  const d = new Date(t - 4 * 3600 * 1000);
  let h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ap} ET`;
}

function legToTicket(l: SpecialLeg): TicketLeg {
  return {
    selection: l.participant,
    market: l.marketLabel,
    line: l.line ?? undefined,
    matchup: l.fixture,
    // Team-referenced legs (moneyline) show that team's flag; match-level totals show both fixture flags.
    flagHome: (l.countryCode ?? l.flagHome) ?? undefined,
    flagAway: l.team ? undefined : (l.flagAway ?? undefined),
    player: l.kind === "player" ? l.participant : undefined,
    photoUrl: l.photoUrl ?? undefined,
    kickoffEt: kickoffEt(l.startTime),
    odds: l.odds,
    result: normalizeLegResult(undefined, l.settlementStatus),
    official: l.settlementReason ?? undefined,
    source: "API-Football",
  };
}

const STATUS_TO_TICKET: Record<SpecialsCardStatus, TicketStatus> = {
  candidate: "candidate", pending: "pending", won: "won", lost: "lost", void: "void",
};

const NO_THEME = "Specials"; // fallback group for cards built without a curated theme

/** Status for a single card from its legs' kickoffs (mirrors the lib's per-card derivation). Used for the
 *  Round-of-32 coverage specials, which live on `result.coverageCards` (separate from the longshot set). */
function coverageStatus(card: WorldCupSpecialCard, nowMs: number): SpecialsCardStatus {
  if (card.cardStatus === "won") return "won";
  if (card.cardStatus === "lost") return "lost";
  const started = (card.legs ?? []).some((l) => {
    if (!l.startTime) return false;
    const t = Date.parse(l.startTime);
    return Number.isFinite(t) && t <= nowMs;
  });
  return started ? "pending" : "candidate";
}

const COVERAGE_TIER_TONE: Record<string, "neutral" | "warn" | "hot"> = {
  conservative: "neutral", balanced: "warn", aggressive: "hot",
};

type TrackerRow = { card: WorldCupSpecialCard; status: SpecialsCardStatus };

/** Group tracker rows by curated theme, preserving first-seen order; un-themed cards fall under "Specials". */
function groupByTheme(rows: TrackerRow[]): Array<{ theme: string; rows: TrackerRow[] }> {
  const order: string[] = [];
  const byTheme = new Map<string, TrackerRow[]>();
  for (const r of rows) {
    const theme = r.card.theme || NO_THEME;
    if (!byTheme.has(theme)) { byTheme.set(theme, []); order.push(theme); }
    byTheme.get(theme)!.push(r);
  }
  return order.map((theme) => ({ theme, rows: byTheme.get(theme)! }));
}

/** A small gold pill carrying the card's curated theme (e.g. "Favorites Rolling"). */
function ThemeBadge({ theme }: { theme: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.1em]"
      style={{ fontSize: 9, color: "var(--vault-gold)", background: "color-mix(in srgb, var(--vault-gold) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--vault-gold) 35%, transparent)" }}
    >
      ◆ {theme}
    </span>
  );
}

/** Confidence / volatility / correlation chips — the editorial-desk read at a glance. Each carries a
 *  faint tone so a reader scans "Speculative · Extreme · positive" without reading the prose. */
function EditorialChip({ label, value, tone }: { label: string; value: string; tone: "neutral" | "warn" | "hot" }) {
  const fg = tone === "hot" ? "var(--vault-gold)" : tone === "warn" ? "#e0a96d" : "var(--vault-text-mute)";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.08em]"
      style={{ fontSize: 9, color: fg, background: "var(--vault-wash-soft)", border: "1px solid var(--vault-rule)" }}
    >
      <span style={{ color: "var(--vault-text-faint)" }}>{label}</span> {value}
    </span>
  );
}

const VOL_TONE: Record<string, "neutral" | "warn" | "hot"> = { Low: "neutral", Medium: "neutral", High: "warn", Extreme: "hot" };
const CONF_TONE: Record<string, "neutral" | "warn" | "hot"> = { High: "hot", Solid: "hot", Lean: "warn", Speculative: "warn" };

/** The editorial body shown under the title: subtitle, conf/vol/correlation chips, the analyst explanation,
 *  and the stitched expected game script. Only renders the parts a card actually carries (backward-safe). */
function EditorialBody({ card }: { card: WorldCupSpecialCard }) {
  const hasChips = !!(card.confidence || card.volatility || card.correlation);
  if (!card.subtitle && !card.explanation && !card.expectedGameScript && !hasChips) return null;
  return (
    <div className="flex flex-col gap-2">
      {card.subtitle ? (
        <p className="text-[12.5px]" style={{ color: "var(--vault-text)", fontWeight: 600, lineHeight: 1.4 }}>{card.subtitle}</p>
      ) : null}
      {hasChips ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {card.coverageTier ? <EditorialChip label="tier" value={card.coverageTier} tone={COVERAGE_TIER_TONE[card.coverageTier] ?? "neutral"} /> : null}
          {card.confidence ? <EditorialChip label="conf" value={card.confidence} tone={CONF_TONE[card.confidence] ?? "neutral"} /> : null}
          {card.volatility ? <EditorialChip label="vol" value={card.volatility} tone={VOL_TONE[card.volatility] ?? "neutral"} /> : null}
          {card.correlation ? <EditorialChip label="corr" value={card.correlation.direction} tone={card.correlation.direction === "independent" ? "neutral" : "warn"} /> : null}
        </div>
      ) : null}
      {card.explanation ? (
        <p className="text-[12px]" style={{ color: "var(--vault-text-mute)", lineHeight: 1.55 }}>{card.explanation}</p>
      ) : null}
      {card.expectedGameScript ? (
        <div className="rounded-[10px] px-3 py-2" style={{ background: "color-mix(in srgb, var(--vault-wash-base) 3%, transparent)", border: "1px solid var(--vault-rule)" }}>
          <div className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-gold)", fontSize: 8.5, marginBottom: 3 }}>Expected game script</div>
          <p className="text-[11.5px]" style={{ color: "var(--vault-text-mute)", lineHeight: 1.5 }}>{card.expectedGameScript}</p>
        </div>
      ) : null}
    </div>
  );
}

function SpecialTicket({ card, status, idx }: { card: WorldCupSpecialCard; status: SpecialsCardStatus; idx: number }) {
  const settled = status === "won" || status === "lost" || status === "void";
  // Prefer the editorial subtitle as the ticket subtitle; fall back to the first "why" line on legacy cards.
  return (
    <TicketCard
      accent="gold"
      title={card.theme ? `${card.theme} · ${card.label} #${idx + 1}` : `${card.label} #${idx + 1}`}
      subtitle={card.subtitle ?? card.whyThisCard?.[0]}
      sport="World Cup"
      risk={card.risk}
      status={STATUS_TO_TICKET[status]}
      odds={card.combinedOdds}
      oddsTone="gold"
      stake={card.stakePreview}
      projectedReturn={card.projectedReturn}
      footer={settled
        ? <span className="text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>Settled review — graded leg-by-leg from the official 90-minute result. Not a pre-event pick.</span>
        : (card.correlation?.summary ?? card.whyItCanFail?.[0]
          ? <span className="text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>{card.correlation?.summary ?? card.whyItCanFail?.[0]}</span>
          : undefined)}
    >
      {/* Editorial body sits above the legs so the card reads as desk analysis, not a bare odds list. */}
      {!settled && (card.subtitle || card.explanation || card.expectedGameScript || card.confidence) ? (
        <div className="mb-2.5 border-b pb-2.5" style={{ borderColor: "var(--vault-rule)" }}>
          <EditorialBody card={card} />
        </div>
      ) : null}
      {(card.legs ?? []).map((l, j) => <LegRow key={l.legId ?? j} leg={legToTicket(l)} />)}
    </TicketCard>
  );
}

export default function WorldCupSpecialsTracker({
  result, nowIso, mode = "full",
}: {
  result: WorldCupSpecialsResult | null;
  nowIso: string;
  mode?: "full" | "compact" | "summary";
}) {
  const t = deriveSpecialsTracker(result, nowIso);
  const compact = mode === "compact";
  const summaryOnly = mode === "summary";

  // Round-of-32 cross-game COVERAGE specials (separate from the longshot set on `result.cards`).
  // Ordered conservative → balanced → aggressive so the section reads safest-first.
  const nowMs = Date.parse(nowIso);
  const TIER_ORDER: Record<string, number> = { conservative: 0, balanced: 1, aggressive: 2 };
  const coverageRows: TrackerRow[] = (result?.coverageCards ?? [])
    .map((card) => ({ card, status: coverageStatus(card, Number.isFinite(nowMs) ? nowMs : 0) }))
    .sort((a, b) => (TIER_ORDER[a.card.coverageTier ?? "balanced"] ?? 1) - (TIER_ORDER[b.card.coverageTier ?? "balanced"] ?? 1));

  const summaryTiles: Array<[string, string]> = [
    ["Record", t.summary.record],
    ["Candidates", String(t.summary.candidateCount)],
    ["In progress", String(t.summary.pendingCount)],
    ["Settled", String(t.summary.settledCount)],
  ];

  return (
    <section aria-label="World Cup Specials Tracker" className="flex flex-col gap-4">
      <div className="rounded-2xl px-5 py-4" style={{ border: "1px solid color-mix(in srgb, var(--vault-gold) 45%, transparent)", background: "linear-gradient(135deg, color-mix(in srgb, var(--vault-gold) 8%, transparent), color-mix(in srgb, var(--vault-scrim-base) 42%, transparent))" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono uppercase tracking-[0.2em]" style={{ color: "var(--vault-gold)", fontSize: 10 }}>🏆 World Cup Specials · daily tracker</span>
          <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>no exposure · suggested cards</span>
        </div>
        {result?.diagnostics?.playerPropsUnavailable ? (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono uppercase tracking-[0.08em]"
            style={{ fontSize: 9.5, color: "var(--vault-gold)", background: "color-mix(in srgb, var(--vault-gold) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--vault-gold) 35%, transparent)" }}>
            ⚑ Player props unavailable — using team models
          </div>
        ) : null}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {summaryTiles.map(([k, v]) => (
            <div key={k} className="rounded-[10px] px-3 py-2" style={{ background: "var(--vault-wash-soft)", border: "1px solid var(--vault-rule)" }}>
              <div className="font-mono tabular" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>{v}</div>
              <div className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{k}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>
          Model-ranked suggested longshot cards — <strong style={{ color: "var(--vault-text)" }}>no exposure is placed</strong>; the record tracks officially-settled cards only. Separate from Bank Builder, Moonshot, and the protected crown. Paper-only.
        </p>
      </div>

      {summaryOnly ? (
        <Link href="/world-cup-specials" className="inline-flex items-center gap-1 self-start rounded-full px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em]" style={{ border: "1px solid color-mix(in srgb, var(--vault-gold) 45%, transparent)", color: "var(--vault-gold)", textDecoration: "none" }}>
          Open the World Cup Specials tracker →
        </Link>
      ) : (
        <>
          {[
            { key: "pending", title: "In progress · pending settlement", rows: t.pending },
            { key: "candidates", title: "Pre-event candidates", rows: t.candidates },
            { key: "settled", title: "Settled review", rows: t.settled },
          ].filter((s) => s.rows.length > 0).map((s) => {
            // In compact mode show only the single lead card; otherwise group the section's cards by theme.
            const shown = compact ? s.rows.slice(0, 1) : s.rows;
            const groups = groupByTheme(shown);
            return (
              <div key={s.key} className="flex flex-col gap-4">
                <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold)", fontSize: 11 }}>{s.title} · {s.rows.length}</span>
                {groups.map((g) => (
                  <div key={g.theme} className="flex flex-col gap-3">
                    {/* Theme sub-header: a small gold pill + the per-theme card count. */}
                    <div className="flex items-center gap-2">
                      <ThemeBadge theme={g.theme} />
                      <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
                        {g.rows.length} card{g.rows.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    {g.rows.map((r, i) => <SpecialTicket key={r.card.id ?? `${g.theme}-${i}`} card={r.card} status={r.status} idx={i} />)}
                  </div>
                ))}
              </div>
            );
          })}
          {/* ── Round-of-32 cross-game COVERAGE specials ─────────────────────────────────────────────
              A separate class of team-market card that spans the WHOLE slate (one leg per game). Lower-odds,
              honest cross-match (independent) coverage — NOT the longshot product above. */}
          {coverageRows.length ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold)", fontSize: 11 }}>
                  Round of 32 · cross-game coverage · {coverageRows.length}
                </span>
                <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
                  one team-market leg per game · independent
                </span>
              </div>
              <p className="text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>
                Real markets only — each card covers the whole slate with one pick per game (moneyline / total / double-chance / draw-no-bet), computed from the de-vig per-side prices. Cross-match, so the legs are independent. Labelled conservative → aggressive. Paper-only, no exposure.
              </p>
              {(compact ? coverageRows.slice(0, 1) : coverageRows).map((r, i) => (
                <div key={r.card.id ?? `coverage-${i}`} className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <ThemeBadge theme={r.card.theme ?? "Coverage"} />
                    {r.card.coverageTier ? (
                      <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
                        {r.card.coverageTier} · {r.card.games.length} game{r.card.games.length === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>
                  <SpecialTicket card={r.card} status={r.status} idx={i} />
                </div>
              ))}
            </div>
          ) : null}
          {t.pending.length + t.candidates.length + t.settled.length + coverageRows.length === 0 ? (
            <div className="rounded-xl px-4 py-6 text-center" style={{ border: "1px dashed var(--vault-border)", background: "var(--vault-wash-faint)" }}>
              <p style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>No World Cup Specials on the current slate</p>
              <p className="mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>A fresh box of model-ranked specials posts once the next multi-game slate&apos;s odds and props are available.</p>
            </div>
          ) : null}
          {compact ? (
            <Link href="/world-cup-specials" className="inline-flex items-center gap-1 self-start rounded-full px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em]" style={{ border: "1px solid color-mix(in srgb, var(--vault-gold) 45%, transparent)", color: "var(--vault-gold)", textDecoration: "none" }}>
              Open the full World Cup Specials tracker →
            </Link>
          ) : (
            <p className="font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>
              Daily tracker shows the current slate&apos;s specials. Settled cards are review-only (graded from official sources); earlier days are not backfilled here.
            </p>
          )}
        </>
      )}
    </section>
  );
}
