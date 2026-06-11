/**
 * WcProjectionCard — GameTime Picks MODEL projection for one World Cup match (90-minute
 * regulation). Shows the model pick(s) with model probability vs market probability, edge,
 * confidence, and the recent-form factors that moved it. This is a model lean (recent-form
 * Poisson blended with the de-vigged market), NOT the raw market outlook. Draw is a real
 * outcome; extra time/penalties are excluded.
 */
import type { WcProjection } from "@/lib/world-cup/projections";
import { fmtAmerican } from "@/lib/world-cup/projections";
import FlagBadge from "@/components/flag-badge";

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

export default function WcProjectionCard({
  projections,
  homeCode,
  awayCode,
  group,
  kickoff,
}: {
  projections: WcProjection[];
  homeCode: string;
  awayCode: string;
  group?: string | null;
  kickoff?: string | null;
}) {
  if (projections.length === 0) return null;
  const head = projections[0];
  const sampleWarn = projections.some((p) => p.sampleSizeWarning);

  return (
    <article
      className="rounded-[8px] px-4 py-4 flex flex-col gap-3"
      style={{ background: "rgba(7,11,26,0.55)", border: "1px solid var(--vault-border)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold)", fontSize: 9 }}>
          {group ? `Group ${group}` : "World Cup"} · model
        </span>
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
          {kickoff ?? ""}
        </span>
      </div>

      {/* Matchup */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FlagBadge code={homeCode} size="md" />
          <span className="font-display tracking-tight truncate" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 600 }}>
            {head.homeTeam}
          </span>
        </div>
        <span className="font-mono shrink-0" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>vs</span>
        <div className="flex items-center gap-2 min-w-0 justify-end">
          <span className="font-display tracking-tight truncate text-right" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 600 }}>
            {head.awayTeam}
          </span>
          <FlagBadge code={awayCode} size="md" />
        </div>
      </div>

      {/* Model picks */}
      <div className="flex flex-col gap-2">
        {projections.map((p) => {
          const edgePos = p.edgePct >= 0;
          return (
            <div
              key={p.id}
              className="rounded-[6px] px-3 py-2.5 flex flex-col gap-1.5"
              style={{ background: "rgba(0,0,0,0.30)", border: "1px solid var(--vault-rule)" }}
            >
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="font-mono uppercase tracking-[0.10em] truncate" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
                  {p.market === "moneyline_90" ? "90-min result" : p.market === "match_total_goals" ? "Match total" : p.market}
                </span>
                <span
                  className="font-mono uppercase tracking-[0.08em] shrink-0 px-1.5 py-0.5 rounded-[3px]"
                  style={{
                    color: p.confidence ? "var(--vault-gold-bright)" : "var(--vault-text-faint)",
                    border: `1px solid ${p.confidence ? "var(--vault-gold-bright)" : "var(--vault-rule)"}`,
                    fontSize: 8.5,
                  }}
                >
                  {p.confidence ?? "—"} conf
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="font-display tracking-tight truncate" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>
                  {p.pickLabel}
                </span>
                <span className="font-mono shrink-0" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>
                  {fmtAmerican(p.americanOdds)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>
                  Model {pct(p.modelProbability)} · Market {pct(p.marketProbability)}
                </span>
                <span
                  className="font-mono tabular shrink-0"
                  style={{ color: edgePos ? "var(--vault-success)" : "var(--vault-text-faint)", fontSize: 11, fontWeight: 600 }}
                >
                  {edgePos ? "+" : ""}{p.edgePct.toFixed(1)}% edge
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Factors */}
      {head.factors.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {head.factors.slice(0, 3).map((f, i) => (
            <li key={i} className="text-[10.5px] leading-snug flex gap-1.5" style={{ color: "var(--vault-text-mute)" }}>
              <span aria-hidden style={{ color: "var(--vault-gold)" }}>·</span>
              <span className="min-w-0">{f}</span>
            </li>
          ))}
        </ul>
      )}

      <p style={{ color: "var(--vault-text-faint)", fontSize: 9.5, lineHeight: 1.4 }}>
        GameTime Picks model — recent national-team form blended with the market.
        {sampleWarn ? " Early-tournament sample; confidence capped Low." : ""} 90-minute regulation
        only (Draw is a real outcome; extra time/penalties not included). Educational / paper only.
      </p>
    </article>
  );
}
