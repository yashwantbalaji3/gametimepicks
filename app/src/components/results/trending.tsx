/**
 * RESULTS V2 · TRENDING ON OUR BOARDS (B-5). Descriptive only — who finished furthest above and below our
 * median in the latest NFL week with final games. Visibly NOT a pick and NOT a record; the denominator is
 * printed with every family. Server component over lib/results/v2/trending.ts.
 */
import type { TrendRow, Trending } from "@/lib/results/v2/trending";

const UNIT: Record<string, string> = { player_rush_yds: "yds", player_reception_yds: "yds", player_receptions: "rec" };
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

function Rows({ rows, unit }: { rows: TrendRow[]; unit: string }) {
  if (!rows.length) return <p className="m-0 text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>None this week.</p>;
  return (
    <ol className="m-0 p-0 list-none">
      {rows.map((r) => (
        <li key={`${r.providerEventId}-${r.name}`} className="text-[12.5px] py-1" style={{ color: "var(--vault-text)" }}>
          {r.name} <span style={{ color: "var(--vault-text-mute)" }}>{r.team}{r.opponent ? ` v ${r.opponent}` : ""} · {r.actual} {unit} vs our {r.median} ({signed(r.delta)})</span>
        </li>
      ))}
    </ol>
  );
}

export default function TrendingOnOurBoards({ trending }: { trending: Trending | null }) {
  return (
    <section aria-labelledby="trending-h" className="mb-8 rounded-xl p-4" style={{ border: "1px dashed var(--vault-border)" }}>
      <h2 id="trending-h" className="m-0 font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-mute)" }}>Trending on our boards · descriptive, not picks</h2>
      {trending == null ? (
        <p className="m-0 mt-2 text-[13px]" style={{ color: "var(--vault-text-mute)" }}>No NFL week has a final game yet.</p>
      ) : (
        <>
          <p className="m-0 mt-1 mb-3 text-[12.5px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
            NFL {trending.periodLabel}{trending.gamesPending ? ` · ${trending.gamesFinal} of ${trending.gamesFinal + trending.gamesPending} games final` : ""}: who finished furthest from our median.
            A look back, not a prediction and not a record — players who did not play are left out.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {trending.families.map((f) => (
              <div key={f.prop}>
                <h3 className="m-0 text-[13.5px] font-semibold" style={{ color: "var(--vault-text)" }}>{f.label} <span className="font-normal text-[12px]" style={{ color: "var(--vault-text-mute)" }}>· of {f.graded} graded</span></h3>
                <p className="m-0 mt-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-mute)" }}>Above our median</p>
                <Rows rows={f.above} unit={UNIT[f.prop] ?? ""} />
                <p className="m-0 mt-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-mute)" }}>Below our median</p>
                <Rows rows={f.below} unit={UNIT[f.prop] ?? ""} />
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
