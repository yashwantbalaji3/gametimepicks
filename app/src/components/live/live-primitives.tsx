"use client";
/**
 * LIVE UI PRIMITIVES (v1.1 · §18) — one visual language for every sport.
 *
 * THE ONE JOB THIS FILE HAS. A reader must never be able to confuse a fact the feed reported with a
 * prediction GameTime froze before kickoff. So the distinction is carried THREE ways, not one:
 * visually (different panel, different weight), in words ("LIVE" vs "Pregame GameTime · frozen"),
 * and in the accessible sentence each row exposes to a screen reader. A colour alone would carry it
 * for nobody using assistive technology.
 *
 * NO PROBABILITY IS EXPRESSIBLE HERE. These components accept a number and a band and say where the
 * number sits. There is no prop through which a percentage, a pace or an updated forecast could be
 * passed, which is a stronger guarantee than a rule about copy.
 */
import { ageSeconds } from "@/lib/live/freshness.mjs";

const MONO = "var(--font-mono)";

/* ─────────────────────────── status badge ─────────────────────────── */

const BADGE: Record<string, { label: string; fg: string; bg: string; border: string }> = {
  LIVE: { label: "LIVE", fg: "var(--vault-bg)", bg: "var(--vault-success)", border: "var(--vault-success)" },
  DELAYED: { label: "DELAYED", fg: "var(--vault-warn)", bg: "transparent", border: "var(--vault-warn)" },
  FINAL: { label: "FINAL", fg: "var(--vault-text-mute)", bg: "transparent", border: "var(--vault-border-strong)" },
  PRE: { label: "SCHEDULED", fg: "var(--vault-text-mute)", bg: "transparent", border: "var(--vault-border)" },
  POSTPONED: { label: "POSTPONED", fg: "var(--vault-warn)", bg: "transparent", border: "var(--vault-warn)" },
  CANCELLED: { label: "CANCELLED", fg: "var(--vault-text-mute)", bg: "transparent", border: "var(--vault-border-strong)" },
  UNKNOWN: { label: "STATUS UNKNOWN", fg: "var(--vault-text-mute)", bg: "transparent", border: "var(--vault-border)" },
};

export function LiveBadge({ state, freshness }: { state: string; freshness?: { level: string } }) {
  // A stale in-play feed is badged STALE, never LIVE: the word "live" is a claim about now, and an
  // old payload cannot make it. This is the whole point of re-deriving freshness on the reader.
  const stale = freshness?.level === "STALE" && (state === "LIVE" || state === "DELAYED");
  const b = stale
    ? { label: "FEED STALE", fg: "var(--vault-warn)", bg: "transparent", border: "var(--vault-warn)" }
    : (BADGE[state] ?? BADGE.UNKNOWN);
  return (
    <span
      style={{
        fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
        color: b.fg, background: b.bg, border: `1px solid ${b.border}`,
        borderRadius: 3, padding: "2px 6px", whiteSpace: "nowrap", display: "inline-block",
      }}
    >
      {b.label}
    </span>
  );
}

/* ─────────────────────────── freshness line ─────────────────────────── */

export function FreshnessLine({ state, freshness }: { state: string; freshness: { level: string; ageMs: number | null } }) {
  if (state !== "LIVE" && state !== "DELAYED") return null;
  const secs = ageSeconds(freshness.ageMs);
  // An unknown age says so. "Updated 0 sec ago" would be a confident claim we cannot support.
  const text =
    secs === null
      ? "Live feed age unknown — showing the last confirmed state"
      : freshness.level === "STALE"
        ? `Live feed delayed — showing the last confirmed state from ${formatAge(secs)} ago`
        : `Live feed updated ${formatAge(secs)} ago`;
  return (
    <p style={{ fontFamily: MONO, fontSize: 10, color: freshness.level === "FRESH" ? "var(--vault-text-faint)" : "var(--vault-warn)", margin: 0 }}>
      {text}
    </p>
  );
}

function formatAge(secs: number): string {
  if (secs < 60) return `${secs} sec`;
  const m = Math.floor(secs / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr`;
}

/* ─────────────────────────── score strip ─────────────────────────── */

export function LiveScoreStrip({ envelope }: { envelope: any }) {
  const { home, away } = envelope.competitors;
  const row = (side: any, isHome: boolean) => (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "6px 0" }}>
      <span style={{ fontFamily: "var(--font-headline)", fontSize: 15, color: "var(--vault-text)" }}>
        {side.abbr ?? side.name ?? (isHome ? "Home" : "Away")}
      </span>
      <span style={{ fontFamily: MONO, fontSize: 22, fontVariantNumeric: "tabular-nums", color: "var(--vault-text)" }}>
        {/* An absent score renders as an em dash. A 0 here would be a score the feed never gave. */}
        {side.score === null ? "—" : side.score}
      </span>
    </div>
  );
  return (
    <div>
      {row(away, false)}
      <div style={{ borderTop: "1px solid var(--vault-border)" }} />
      {row(home, true)}
    </div>
  );
}

/** Period / clock / situation — every part optional, because every provider omits some of them. */
export function LivePeriodLine({ envelope }: { envelope: any }) {
  const parts: string[] = [];
  if (envelope.period?.label) parts.push(envelope.period.label);
  if (envelope.period?.clock) parts.push(envelope.period.clock);
  if (envelope.situation?.downDistance) parts.push(envelope.situation.downDistance);
  if (typeof envelope.situation?.outs === "number") parts.push(`${envelope.situation.outs} out`);
  if (!parts.length) return null;
  return (
    <p style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-text-mute)", margin: "4px 0 0" }}>
      {parts.join(" · ")}
    </p>
  );
}

/* ───────────────────── live value vs frozen range ───────────────────── */

const POSITION_COPY: Record<string, string> = {
  INSIDE: "inside pregame range",
  BELOW: "below pregame range",
  ABOVE: "above pregame range",
};

/**
 * One player-stat row: a live cumulative value beside the frozen pregame band.
 *
 * The bar is decoration and is `aria-hidden`; the sentence beneath it is the real content, so the
 * row conveys exactly the same thing whether or not it is seen. Deliberately NOT labelled "on
 * track" (§18) — that phrase reads as a forecast and this row is not one.
 */
export function LiveRangeRow({
  name, label, value, rangeLow, rangeHigh, position, sentence,
}: {
  name: string; label: string; value: number | null;
  rangeLow: number | null; rangeHigh: number | null;
  position: string | null; sentence: string;
}) {
  const hasBand = typeof rangeLow === "number" && typeof rangeHigh === "number" && rangeHigh > rangeLow;
  const pct = hasBand && typeof value === "number"
    ? Math.max(0, Math.min(100, ((value - rangeLow!) / (rangeHigh! - rangeLow!)) * 100))
    : null;

  return (
    <div style={{ padding: "8px 0", borderTop: "1px solid var(--vault-border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "var(--vault-text)" }}>
          {name} <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>· {label}</span>
        </span>
        <span style={{ fontFamily: MONO, fontSize: 13, fontVariantNumeric: "tabular-nums", color: "var(--vault-text)", whiteSpace: "nowrap" }}>
          {value === null ? "—" : value}
          {hasBand && (
            <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>
              {" "}/ {rangeLow}–{rangeHigh}
            </span>
          )}
        </span>
      </div>

      {hasBand && (
        <div aria-hidden="true" style={{ position: "relative", height: 4, background: "var(--vault-panel-elevated)", borderRadius: 2, marginTop: 6 }}>
          <div style={{ position: "absolute", inset: 0, background: "var(--vault-border-strong)", borderRadius: 2, opacity: 0.6 }} />
          {pct !== null && (
            <div style={{ position: "absolute", top: -2, left: `${pct}%`, width: 2, height: 8, background: "var(--vault-gold)", transform: "translateX(-1px)" }} />
          )}
        </div>
      )}

      {/* The sentence IS the content. Visually small, but never hidden from anyone. */}
      <p style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)", margin: "4px 0 0" }}>
        {value === null
          ? "Nothing recorded yet in this game"
          : position
            ? POSITION_COPY[position]
            : "No pregame range published"}
      </p>
      <span className="sr-only">{sentence}</span>
    </div>
  );
}

/* ─────────────────────────── refusal card ─────────────────────────── */

const REFUSAL_COPY: Record<string, string> = {
  PROVIDER_ERROR: "Live data is unavailable right now. The pregame forecast below is unaffected.",
  PROVIDER_MALFORMED: "The live source returned something we could not read. Live data is unavailable.",
  EVENT_NOT_FOUND: "No live data source covers this game.",
  AMBIGUOUS_EVENT_MAPPING: "Live data could not be matched to this game with certainty, so none is shown.",
  UNSUPPORTED_SPORT: "Live data is not available for this sport yet.",
  FEATURE_DISABLED: "Live data is turned off.",
};

/** Refusal is a designed state, not an error screen — the frozen forecast keeps working beside it. */
export function LiveUnavailable({ reason }: { reason: string }) {
  return (
    <div role="status" style={{ border: "1px solid var(--vault-border)", borderRadius: 4, padding: "10px 12px", background: "var(--vault-panel)" }}>
      <p style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--vault-text-faint)", margin: "0 0 4px" }}>
        Live data unavailable
      </p>
      <p style={{ fontSize: 12, color: "var(--vault-text-mute)", margin: 0 }}>
        {REFUSAL_COPY[reason] ?? REFUSAL_COPY.PROVIDER_ERROR}
      </p>
    </div>
  );
}
