/**
 * ONE DISTRIBUTION CHART, FOR EVERY SPORT THAT SIMULATES.
 *
 * The EPL match report drew its scoreline and goal-total distributions as compact column charts and
 * every figure beside them as a probability bar — 47 of them on one page. MLB's game report drew
 * none, despite the full-game engine running ten thousand complete games per matchup and producing
 * a margin distribution, a total distribution, top scorelines and run-line cover probabilities. All
 * of it was computed, written to the artifact, and then printed as numbers in a table.
 *
 * Rather than write a second chart for baseball, the EPL one moved here. A second implementation is
 * a second set of rounding rules, a second idea of what "the modal bucket" means, and eventually two
 * sports whose identical distributions look different for no reason.
 *
 * TWO RULES THIS KEEPS:
 *   - the figure is ALWAYS printed as text as well as drawn. A bar is a comparison; the number is
 *     the claim, and a reader who cannot judge a 3px difference should not have to.
 *   - a bucket at zero still gets a visible sliver, so "we simulated this and it never happened" is
 *     distinguishable from "this bucket does not exist".
 */

const pct = (p: number) => `${(Math.max(0, Math.min(1, p)) * 100).toFixed(1)}%`;

/** A horizontal probability bar. Width is the probability; the figure is always printed as text too. */
export function ProbabilityBar({ label, p, color, sub }: { label: string; p: number; color: string; sub?: string }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontSize: 13, color: "var(--vault-text)" }}>{label}</span>
        <span className="font-mono" style={{ fontSize: 13, fontWeight: 700, color }}>{pct(p)}</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: "var(--vault-rule)", overflow: "hidden" }}>
        <div style={{ width: `${Math.max(0, Math.min(1, p)) * 100}%`, height: "100%", background: color, borderRadius: 999 }} />
      </div>
      {sub ? <span className="font-mono" style={{ fontSize: 10.5, color: "var(--vault-text-faint)" }}>{sub}</span> : null}
    </div>
  );
}

/**
 * A compact column chart over a discrete distribution, with the modal bucket emphasised.
 *
 * `markAt` draws a reference line — the sportsbook's line, so a reader can see how much of the
 * simulated mass sits either side of the number being offered. It is passed as an index rather than
 * a value so the caller owns the mapping from bucket to meaning.
 */
export function Histogram({
  values, labelFor, accent, markAt, markLabel, height = 96,
}: {
  values: number[];
  labelFor: (i: number) => string;
  accent: string;
  markAt?: number | null;
  markLabel?: string;
  height?: number;
}) {
  const max = Math.max(...values, 1e-9);
  return (
    <div>
      {markLabel && markAt != null ? (
        <div className="font-mono" style={{ fontSize: 10, color: "var(--vault-text-faint)", marginBottom: 2 }}>{markLabel}</div>
      ) : null}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height }}>
        {values.map((v, i) => (
          <div key={i} style={{ flex: 1, display: "grid", gap: 4, justifyItems: "center", position: "relative" }}>
            <span className="font-mono" style={{ fontSize: 9, color: "var(--vault-text-faint)" }}>
              {v >= 0.01 ? Math.round(v * 100) : ""}
            </span>
            <div
              title={`${labelFor(i)}: ${pct(v)}`}
              style={{
                width: "100%",
                /* A floor of 2px: a bucket the simulation never landed in is still a bucket that was
                   simulated, and an invisible column reads as an absent one. */
                height: Math.max(2, (v / max) * (height - 32)),
                borderRadius: 3,
                background: v === max ? accent : `color-mix(in srgb, ${accent} 38%, transparent)`,
                outline: markAt === i ? `1px dashed var(--vault-text-mute)` : undefined,
                outlineOffset: markAt === i ? 2 : undefined,
              }}
            />
            <span className="font-mono" style={{ fontSize: 9.5, color: "var(--vault-text-mute)" }}>{labelFor(i)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
