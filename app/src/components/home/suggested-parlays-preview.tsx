/**
 * Suggested-parlays preview — the homepage strip for the Parlay Lab's four daily risk evaluations
 * (Program 200 · Release B).
 *
 * Purely presentational: every row comes pre-derived from lib/home/suggested-parlays.mjs, which
 * itself only reshapes the day's risk-coverage matrix. A tier chip renders the evaluation's OWN
 * state — a published card or an explicit no-play — and a closed lane renders its gate's reason.
 * Nothing here can invent, force or hide a card.
 */
import Link from "next/link";
import { PUBLIC_RISK_LABELS } from "@/lib/parlays/risk-odds-bands.mjs";
import { etStamp } from "@/lib/et-stamp.mjs";

/**
 * GTP-27 (2026-10-14) — A CLOSED LANE IN READER WORDS. The gate's reason is written for the pipeline:
 * "lane evaluation of record refused (CAPABILITY_GATED) at 2026-10-13T18:03:34Z; …". The reader gets a
 * sentence; the exact reason stays one click away, with any instant shown in ET. Same fact, two depths.
 */
export function plainLaneReason(reason: string, lane?: string): string {
  /* Review fix: the cross-sport lane's reason of record is often a bare "refused (NOT_ELIGIBLE)" — it is closed
     because fewer than two sports are open, which is decided by the lane, not by the code. */
  if (lane === "multi" || /two live sports|cross-sport card needs/.test(reason)) return "a mixed-sport card needs two sports open today";
  if (/CAPABILITY_GATED|not cleared to (publish|show)|SCAFFOLD_ONLY/.test(reason)) return "this sport isn't cleared to publish model cards yet";
  if (/priced game|price capture|days old/.test(reason)) return "not enough current sportsbook prices to build a card today";
  if (/grader|settle/i.test(reason)) return "no official grading path for this sport's cards yet";
  if (/NOT_ELIGIBLE/.test(reason)) return "not eligible today";
  return "no card is offered today";
}
export const readableReason = (reason: string): string =>
  reason.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z/g, (iso) => etStamp(iso) ?? iso);

export interface PreviewTier {
  tier: string;
  state: string;
  slipId: string | null;
}

export interface PreviewLane {
  lane: string;
  label: string;
  date: string | null;
  tiers: PreviewTier[];
  publishedCount: number;
}

export interface PreviewClosedLane {
  lane: string;
  label: string;
  reason: string;
  /** The gate's unclipped reason, for the details disclosure. */
  fullReason?: string;
}

export interface SuggestedParlaysPreviewProps {
  live: PreviewLane[];
  closed: PreviewClosedLane[];
  tierIntent: Record<string, string>;
  /** The build's frozen ET day, so a lane can say whether its card is behind or ahead of the reader. */
  todayEt?: string | null;
}

/* D2: the chip names the tier by its one public label — never a shortened second spelling. */
const TIER_SHORT: Readonly<Record<string, string>> = PUBLIC_RISK_LABELS;

function TierChip({ tier, state, intent }: { tier: string; state: string; intent: string }) {
  const published = state === "PUBLISHED";
  // Anything that is neither a published card nor an explicit no-play (a refused or missing cell
  // that survived the lib's lane folding) renders as "unavailable" — never as a quiet no-play,
  // which would claim an evaluation ran and nothing qualified.
  const noPlay = state === "NO_PLAY";
  return (
    <span
      title={
        published
          ? intent
          : noPlay
            ? `${intent} — no play today: nothing qualified at this tier`
            : `${intent} — this tier's evaluation is unavailable right now`
      }
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono uppercase tracking-[0.08em]"
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: published ? "var(--vault-success)" : "var(--vault-text-faint)",
        background: published ? "var(--vault-success-dim)" : "transparent",
        border: published ? "1px solid color-mix(in srgb, var(--gtp-success-on-dark) 35%, transparent)" : "1px dashed var(--vault-border-strong)",
      }}
    >
      {TIER_SHORT[tier] ?? tier}
      <span style={{ fontWeight: 600, letterSpacing: 0 }}>{published ? "card" : noPlay ? "no play" : "unavailable"}</span>
    </span>
  );
}

/**
 * "Sep 5" — plus a plain word when the date is not the build's own day, because "Sep 1" alone does
 * not tell a reader whether that is behind or ahead of them.
 */
function laneDateLabel(date: string, todayEt: string | null): string {
  const [y, m, d] = date.split("-").map(Number);
  const label = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (!todayEt || todayEt === date) return label;
  return `${label} · ${date > todayEt ? "next card" : "last published"}`;
}

export default function SuggestedParlaysPreview({ live, closed, tierIntent, todayEt = null }: SuggestedParlaysPreviewProps) {
  if (!live.length && !closed.length) return null;
  return (
    <section aria-label="Today's suggested parlays by risk tier" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-mono uppercase tracking-[0.14em]" style={{ fontSize: 10.5, color: "var(--vault-text-faint)" }}>
            Parlay Center
          </div>
          {/* NOT "Today's" (P232 · C). Lanes are event-driven: UFC and EPL carry the card for their
              next fight night or matchweek, and MLB carries the last published product day. On
              2026-09-02 this heading sat over 09-01, 09-05, 09-05 and 09-01 — wrong about all four,
              inches below a strip reading "0 events today". Each lane now states its own date. */}
          <h2 className="font-display tracking-tight" style={{ fontSize: 22, fontWeight: 800, color: "var(--vault-text)" }}>
            Suggested cards by risk tier
          </h2>
        </div>
        <Link
          href="/build"
          className="vault-press inline-flex items-center rounded-full px-4 font-mono uppercase tracking-[0.1em]"
          style={{
            border: "1px solid var(--vault-border-strong)",
            color: "var(--vault-text)",
            fontSize: 11.5,
            fontWeight: 700,
            minHeight: 44,
            textDecoration: "none",
          }}
        >
          View Suggested Parlays →
        </Link>
      </div>

      <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--vault-text-mute)", maxWidth: 680 }}>
        A tier publishes only when enough legs qualify; otherwise it says no play.
      </p>

      <div className="flex flex-col gap-2">
        {live.map((lane) => (
          <div
            key={lane.lane}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] px-4 py-3"
            style={{ border: "1px solid var(--vault-border-strong)", background: "var(--vault-bg-raised, transparent)" }}
          >
            <span className="flex flex-col" style={{ minWidth: 110 }}>
              <span className="font-mono" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--vault-text)" }}>
                {lane.label}
              </span>
              {/* The date the card belongs to. A row of tier chips with no date cannot be read —
                  "no play" on a lane is a different fact depending on whether it is today's
                  evaluation or last week's. */}
              {lane.date ? (
                <span className="font-mono" style={{ fontSize: 10, color: "var(--vault-text-faint)" }}>
                  {laneDateLabel(lane.date, todayEt)}
                </span>
              ) : null}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {lane.tiers.map((t) => (
                <TierChip key={t.tier} tier={t.tier} state={t.state} intent={tierIntent[t.tier] ?? t.tier} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {closed.length ? (
        <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--vault-text-faint)" }}>
          {closed.map((c, i) => (
            <span key={c.lane}>
              {i > 0 ? " · " : ""}
              <strong style={{ fontWeight: 600 }}>{c.label}</strong> closed — {plainLaneReason(c.fullReason ?? c.reason, c.lane)}
            </span>
          ))}
        </p>
      ) : null}
      {closed.length ? (
        <details style={{ fontSize: 11.5, lineHeight: 1.6, color: "var(--vault-text-faint)" }}>
          <summary style={{ cursor: "pointer" }}>Why each lane is closed (details)</summary>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {closed.map((c) => <li key={c.lane}><strong style={{ fontWeight: 600 }}>{c.label}:</strong> {readableReason(c.fullReason ?? c.reason)}</li>)}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
