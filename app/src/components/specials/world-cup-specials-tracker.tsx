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
      style={{ fontSize: 9, color: "var(--vault-gold)", background: "rgba(212,175,55,0.12)", border: "1px solid color-mix(in srgb, var(--vault-gold) 35%, transparent)" }}
    >
      ◆ {theme}
    </span>
  );
}

function SpecialTicket({ card, status, idx }: { card: WorldCupSpecialCard; status: SpecialsCardStatus; idx: number }) {
  const settled = status === "won" || status === "lost" || status === "void";
  return (
    <TicketCard
      accent="gold"
      title={`${card.label} #${idx + 1}`}
      subtitle={card.whyThisCard?.[0]}
      sport="World Cup"
      risk={card.risk}
      status={STATUS_TO_TICKET[status]}
      odds={card.combinedOdds}
      oddsTone="gold"
      stake={card.stakePreview}
      projectedReturn={card.projectedReturn}
      footer={settled
        ? <span className="text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>Settled review — graded leg-by-leg from the official 90-minute result. Not a pre-event pick.</span>
        : (card.whyItCanFail?.[0] ? <span className="text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>{card.whyItCanFail[0]}</span> : undefined)}
    >
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

  const summaryTiles: Array<[string, string]> = [
    ["Record", t.summary.record],
    ["Candidates", String(t.summary.candidateCount)],
    ["In progress", String(t.summary.pendingCount)],
    ["Settled", String(t.summary.settledCount)],
  ];

  return (
    <section aria-label="World Cup Specials Tracker" className="flex flex-col gap-4">
      <div className="rounded-2xl px-5 py-4" style={{ border: "1px solid color-mix(in srgb, var(--vault-gold) 45%, transparent)", background: "linear-gradient(135deg, rgba(212,175,55,0.08), rgba(26,16,11,0.42))" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono uppercase tracking-[0.2em]" style={{ color: "var(--vault-gold)", fontSize: 10 }}>🏆 World Cup Specials · daily tracker</span>
          <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>no exposure · suggested cards</span>
        </div>
        {result?.diagnostics?.playerPropsUnavailable ? (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono uppercase tracking-[0.08em]"
            style={{ fontSize: 9.5, color: "var(--vault-gold)", background: "rgba(212,175,55,0.10)", border: "1px solid color-mix(in srgb, var(--vault-gold) 35%, transparent)" }}>
            ⚑ Player props unavailable — using team models
          </div>
        ) : null}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {summaryTiles.map(([k, v]) => (
            <div key={k} className="rounded-[10px] px-3 py-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--vault-rule)" }}>
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
          {t.pending.length + t.candidates.length + t.settled.length === 0 ? (
            <div className="rounded-xl px-4 py-6 text-center" style={{ border: "1px dashed var(--vault-border)", background: "rgba(255,255,255,0.02)" }}>
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
