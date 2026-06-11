/**
 * ParlayCoverageGrid — at-a-glance "how many suggested cards per sport per
 * risk level" matrix for the Parlay Lab. Server-safe (no hooks).
 *
 * Honesty: counts come straight from the optimizer payload's
 * `publicRiskSections` (the exact buckets the cards render from). A 0 is
 * shown plainly — never padded. When NBA fills only the Low tier (the
 * single-game-slate signature), we surface the documented explanation so
 * the emptiness reads as intentional, not broken.
 */
import type { OptimizerSnapshot } from "@/lib/parlay-optimizer";

const RISK_COLS = [
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
  { key: "longshot", label: "Longshot" },
] as const;

const SPORT_ROWS_ALL = [
  { key: "nba", label: "NBA" },
  { key: "mlb", label: "MLB" },
  { key: "multi", label: "Mixed" },
] as const;

export default function ParlayCoverageGrid({
  payload,
  /** When true, NBA is shown in its own NBA Finals section, so this grid
   *  covers only the multi-game Main pool (MLB · Mixed) to avoid two
   *  conflicting NBA counts on one page. */
  excludeNba = false,
}: {
  payload: OptimizerSnapshot | null;
  excludeNba?: boolean;
}) {
  const prs = payload?.publicRiskSections;
  if (!prs) return null;
  const SPORT_ROWS = excludeNba
    ? SPORT_ROWS_ALL.filter((r) => r.key !== "nba")
    : SPORT_ROWS_ALL;

  const countAt = (risk: string, sport: string): number => {
    const section = (prs as Record<string, Record<string, unknown[]>>)[risk];
    const arr = section?.[sport];
    return Array.isArray(arr) ? arr.length : 0;
  };

  // Single-game NBA signature: NBA has Low cards but nothing in the
  // higher tiers (the documented same-game-cap behavior on a 1-game slate).
  const nbaLow = countAt("low", "nba");
  const nbaHigher =
    countAt("medium", "nba") + countAt("high", "nba") + countAt("longshot", "nba");
  const nbaSingleGame = nbaLow > 0 && nbaHigher === 0;

  return (
    <section
      aria-label="Suggested parlay coverage by sport and risk"
      className="mb-4 rounded-[8px] px-3 sm:px-4 py-3"
      style={{ background: "var(--gtp-card)", border: "1px solid var(--gtp-card-border)" }}
    >
      <span
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        {excludeNba ? "Main pool · MLB & Mixed by risk" : "Cards by sport & risk"}
      </span>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 320 }}>
          <thead>
            <tr>
              <th className="text-left" style={{ padding: "4px 8px" }} />
              {RISK_COLS.map((c) => (
                <th
                  key={c.key}
                  className="font-mono uppercase tracking-[0.1em] text-center"
                  style={{ color: "var(--vault-text-faint)", fontSize: 10, padding: "4px 8px" }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SPORT_ROWS.map((row) => (
              <tr key={row.key}>
                <td
                  className="font-display"
                  style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600, padding: "4px 8px" }}
                >
                  {row.label}
                </td>
                {RISK_COLS.map((c) => {
                  const n = countAt(c.key, row.key);
                  return (
                    <td
                      key={c.key}
                      className="font-display tabular text-center"
                      style={{
                        color: n > 0 ? "var(--vault-gold-bright)" : "var(--vault-text-faint)",
                        fontSize: 14,
                        fontWeight: n > 0 ? 700 : 400,
                        padding: "4px 8px",
                      }}
                    >
                      {n > 0 ? n : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!excludeNba && nbaSingleGame && (
        <p
          className="mt-2 text-[12px] leading-snug"
          style={{ color: "var(--vault-text-mute)" }}
        >
          NBA is a single-game slate here. Same-game stacking is intentionally
          limited, so we show fewer NBA cards — and only at the lower-risk tier —
          even when many player projections exist. MLB and Mixed fill every tier.
        </p>
      )}
    </section>
  );
}
