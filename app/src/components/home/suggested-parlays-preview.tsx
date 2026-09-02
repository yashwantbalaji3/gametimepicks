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
}

export interface SuggestedParlaysPreviewProps {
  live: PreviewLane[];
  closed: PreviewClosedLane[];
  tierIntent: Record<string, string>;
  /** The build's frozen ET day, so a lane can say whether its card is behind or ahead of the reader. */
  todayEt?: string | null;
}

const TIER_SHORT: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  longshot: "Longshot",
};

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
            Parlay Center · four risk evaluations per lane
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
        Every lane is evaluated at four risk tiers every product day. A tier publishes a card only
        when enough legs qualify — otherwise it says no play, and that refusal is the product working.
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
              <strong style={{ fontWeight: 600 }}>{c.label}</strong> closed — {c.reason}
            </span>
          ))}
        </p>
      ) : null}
    </section>
  );
}
