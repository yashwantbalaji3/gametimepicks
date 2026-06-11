/**
 * PoolAvailabilityNote — honest one-line surface that explains when a
 * sport pool is loaded but produced zero suggested slips.
 *
 * Background: when the R1 `no_logs_insufficient_data` guardrail
 * downgrades every NBA lean to `lean="No Play"` (typically because
 * the upstream `stats.nba.com` recent-form attach step failed), the
 * optimizer correctly emits zero NBA-only and zero Mixed slips. Users
 * otherwise see only MLB and have no way to know why. This banner is
 * the honest disclosure.
 *
 * Renders nothing when both NBA and MLB produced slips (or when both
 * pools are absent — the empty-state copy covers that). Renders only
 * when at least one sport is in the `pool-but-no-slips` state.
 *
 * Pure presentation — does not retry data ingestion, does not change
 * methodology, never fabricates content.
 */
import type { PoolAvailability } from "@/lib/pool-availability";

interface Props {
  availability: PoolAvailability;
}

export default function PoolAvailabilityNote({ availability }: Props) {
  const lines: string[] = [];
  // PR `feature/nba-single-game-parlay-methodology` — when the NBA
  // bucket exists AND every slip in it carries `singleGame=true`, the
  // single-game generator is the only NBA-only path that fired. Tell
  // the user why those slips are higher variance than the standard
  // multi-game build.
  if (availability.nbaSingleGameOnly) {
    lines.push(
      "This slate's NBA-only slips are single-game builds — every leg shares the same matchup, so the cards are labeled higher variance. The lower-risk public sections stay NBA-empty by design.",
    );
  } else if (availability.nba === "pool-but-no-slips") {
    // Two honest causes are possible when NBA leans are loaded but no
    // NBA-only slips were produced:
    //   (a) recent-form game logs failed to attach (R1 guardrail) —
    //       every NBA lean ended up "No Play". This is the case on
    //       outage mornings.
    //   (b) NBA legs DID survive eligibility and even appear in
    //       Mixed slips, but the same-game cap (1 leg/game in the
    //       safer lanes, per PR #110's documented quality decision)
    //       makes NBA-only impossible when only one NBA game is on
    //       the slate.
    // We use Mixed availability as the tell: if Mixed is "present",
    // NBA legs were obviously good enough to clear the gate — the
    // remaining gap is structural, not data.
    if (availability.multi === "present") {
      lines.push(
        "NBA legs appear in the Mixed lane below. NBA-only single-sport slips need ≥2 NBA games to build under the model's same-game cap, and this slate has one NBA game.",
      );
    } else {
      lines.push(
        "NBA leans are loaded but every leg dropped at the recent-form gate — game logs didn't attach this morning. No NBA-only slips today.",
      );
    }
  }
  if (availability.mlb === "pool-but-no-slips") {
    lines.push(
      "MLB leans are loaded but no eligible legs passed the gate this morning. No MLB-only slips today.",
    );
  }
  if (
    availability.multi === "pool-but-no-slips" &&
    availability.nba !== "pool-but-no-slips" &&
    availability.mlb !== "pool-but-no-slips"
  ) {
    // Only surface a dedicated Mixed line when at least one
    // single-sport pool still produced slips — otherwise the NBA/MLB
    // line above already explains the lack of mixed builds.
    lines.push(
      "Mixed builds didn't clear the model's correlation caps today. Single-sport lanes only.",
    );
  }
  // PR `fix/results-active-date-polish` (2026-05-29) — when one
  // sport's pool is fully absent (no upstream board data at all, not
  // just "pool but no slips"), the user otherwise sees the other
  // sport's slips with no explanation of the gap. Tell them
  // honestly: no games scheduled today for that sport. The line
  // never appears when BOTH sports are absent (the page already
  // shows an empty state in that case) and never overrides the more
  // specific "pool-but-no-slips" / "single-game" lines above.
  if (
    availability.nba === "absent" &&
    availability.mlb === "present"
  ) {
    // PR `fix/mono-sport-parlay-lab-polish` (2026-05-29) — tightened
    // the copy now that empty sport tabs (NBA-only, Mixed) are hidden
    // entirely by `getAvailableSportsFromSlips`. The user never sees
    // those tabs on a mono-sport slate, so spelling out "NBA-only and
    // Mixed buckets are honestly empty" added noise without
    // information.
    lines.push("No NBA games scheduled today — MLB-only slate.");
  } else if (
    availability.mlb === "absent" &&
    availability.nba === "present"
  ) {
    lines.push("No MLB games scheduled today — NBA-only slate.");
  }
  if (lines.length === 0) return null;
  return (
    <aside
      role="note"
      aria-label="Sport pool availability"
      className="rounded-[8px] px-3 py-3 flex flex-col gap-1.5"
      style={{
        background: "var(--gtp-card-sunken)",
        border: "1px dashed var(--vault-border)",
      }}
    >
      <span
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        Pool availability
      </span>
      {lines.map((line, i) => (
        <p
          key={i}
          className="text-[12.5px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)", maxWidth: 640 }}
        >
          {line}
        </p>
      ))}
    </aside>
  );
}
