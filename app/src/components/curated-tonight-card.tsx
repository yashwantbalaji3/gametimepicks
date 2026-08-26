/**
 * CuratedTonightCard — "tonight's curated tickets" rail.
 *
 * Surface used by the homepage and /parlay-lab to give a casual
 * reader an immediate answer to "what does the model like tonight?".
 * Renders one ticket per risk profile (top by snapshot score) using
 * the shared `ParlayTicketCard`.
 *
 * Source contract (locked by data-parlays.getCuratedTonightPicks):
 *   - Picks come ONLY from a real pregame snapshot or graded payload
 *     on disk. We never invent a slip.
 *   - Top-1 per profile so the surface stays scannable.
 *   - When the snapshot has no slips for a profile (e.g. conservative
 *     needs ≥2 distinct games and there was only one game tonight),
 *     that profile is silently dropped from the rail.
 *   - When NO snapshot exists at all, this component renders nothing
 *     (returns null) — the page should not render a header for an
 *     empty rail.
 *
 * Honesty:
 *   - "Saved before games" label when the snapshot is pregame.
 *   - "Graded" label when the payload is the graded version.
 *   - No combined odds is invented — `ParlayTicketCard` already shows
 *     "—" when any leg's odds are missing.
 *   - No claimed hit rate is rendered anywhere on this rail.
 */
import Link from "next/link";
import ParlayTicketCard from "./parlay-ticket-card";
import { getCuratedTonightPicks } from "@/lib/data-parlays";

interface Props {
  /** Date to render curated picks for (YYYY-MM-DD). */
  date: string;
  /** Short context shown next to the eyebrow. Defaults to the date. */
  contextLabel?: string;
  /** Optional CTA link rendered to the right of the header. */
  ctaHref?: string;
  ctaLabel?: string;
}

export default function CuratedTonightCard({
  date,
  contextLabel,
  ctaHref,
  ctaLabel,
}: Props) {
  const result = getCuratedTonightPicks(date);
  if (!result) return null;

  const eyebrowAccent =
    result.source === "graded"
      ? "var(--vault-success)"
      : "var(--vault-gold-bright)";
  const eyebrowText =
    result.source === "graded"
      ? "Tonight's curated tickets · graded"
      : "Tonight's curated tickets · saved before games";

  return (
    <section
      className="reveal"
      aria-label={`Curated parlay tickets for ${date}`}
    >
      <div className="flex items-center gap-3 mb-3">
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{
            background: eyebrowAccent,
            boxShadow:
              result.source === "graded"
                ? "0 0 6px rgba(74, 222, 128, 0.45)"
                : "0 0 6px rgba(52, 211, 153, 0.45)",
          }}
        />
        <span
          className="font-mono uppercase tracking-[0.18em]"
          style={{ color: eyebrowAccent, fontSize: 10 }}
        >
          {eyebrowText}
        </span>
        <span
          className="font-mono"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          {contextLabel ?? date}
        </span>
        <div
          className="flex-1 h-px"
          style={{ background: "var(--vault-rule)" }}
        />
        {ctaHref && (
          <Link
            href={ctaHref}
            className="font-mono uppercase tracking-[0.14em] shrink-0"
            style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
          >
            {ctaLabel ?? "Open Parlay Center"} →
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {result.picks.map((pick) => (
          <ParlayTicketCard
            key={pick.slip.slipId}
            slip={pick.slip}
            savedPregame={result.source === "snapshot"}
          />
        ))}
      </div>
      <p
        className="mt-3 text-[11px] leading-relaxed"
        style={{ color: "var(--vault-text-faint)" }}
      >
        One ticket per risk profile, picked by the snapshot&apos;s top
        score. Saved before tipoff and graded after final box scores.
        Educational analytics — not betting advice. Past model agreement
        does not guarantee future outcomes.
      </p>
    </section>
  );
}
