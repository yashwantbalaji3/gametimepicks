/**
 * "HOW THE MODEL'S PICKS ACTUALLY TURNED OUT" — the same section on every sport.
 *
 * Forecasts were published continuously and results were published almost nowhere. That asymmetry
 * always flatters, and it is the shape of every tipster site that has ever existed. This renders the
 * other half, from the sport's own graded ledger, in the same shape for all four.
 *
 * THE HIT RATE IS DELIBERATELY NOT THE HEADLINE. Below a real sample the record renders its rows and
 * its counts and says in words that they support nothing — a percentage in large type over six
 * outcomes is the dishonest version of being transparent.
 */
import Link from "next/link";

import SectionHeader from "@/components/section-header";
import type { GradedRecord } from "@/lib/sports/graded-picks-loader";

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
/** Small samples never get a rate at all — the note explains why, so nothing is hidden. */
const SHOW_RATE = new Set(["ASSESSABLE", "EMERGING"]);

function Outcome({ hit }: { hit: boolean | null }) {
  // A void is its own state and is never coloured or counted as a miss.
  const [label, colour] = hit === true ? ["HIT", "var(--gtp-bank-cta)"]
    : hit === false ? ["MISS", "var(--vault-text-mute)"]
    : ["VOID", "var(--vault-text-faint)"];
  return <span className="font-mono" style={{ fontSize: 10.5, color: colour, letterSpacing: "0.08em" }}>{label}</span>;
}

export default function GradedPicksSection({ record, rows = 6, href }: { record: GradedRecord; rows?: number; href: string }) {
  const c = record.counts;
  return (
    <section className="mt-8">
      <SectionHeader
        eyebrow={`Picks vs outcomes · ${c.counted.toLocaleString()} graded`}
        title="How the model's picks actually turned out"
        sub={record.what}
        rightSlot={
          <Link href={href} className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold)", fontSize: 11 }}>
            Full record →
          </Link>
        }
      />
      <div className="mt-3 flex flex-wrap gap-4 font-mono" style={{ fontSize: 11.5, color: "var(--vault-text-mute)" }}>
        <span>{c.hits.toLocaleString()} hit · {c.misses.toLocaleString()} missed</span>
        {c.voided > 0 ? <span>{c.voided.toLocaleString()} void — a condition that did not hold is never scored as a miss</span> : null}
        {record.hitRate != null && SHOW_RATE.has(record.sampleState) ? <span>{pct(record.hitRate)} hit rate</span> : null}
      </div>
      <p className="mt-2" style={{ fontSize: 12, lineHeight: 1.6, color: "var(--vault-text-faint)", margin: "8px 0 0" }}>
        {record.sampleNote}
      </p>
      {record.caveat ? (
        <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--vault-text-faint)", margin: "6px 0 0" }}>{record.caveat}</p>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ color: "var(--vault-text-faint)", textAlign: "left" }}>
              <th className="font-mono py-1 pr-3" style={{ fontWeight: 500, fontSize: 10.5 }}>Date</th>
              <th className="font-mono py-1 pr-3" style={{ fontWeight: 500, fontSize: 10.5 }}>Event</th>
              <th className="font-mono py-1 pr-3" style={{ fontWeight: 500, fontSize: 10.5 }}>Model said</th>
              <th className="font-mono py-1 pr-3" style={{ fontWeight: 500, fontSize: 10.5 }}>What happened</th>
              <th className="font-mono py-1" style={{ fontWeight: 500, fontSize: 10.5 }}>Result</th>
            </tr>
          </thead>
          <tbody>
            {record.picks.slice(0, rows).map((p) => (
              <tr key={p.eventId ?? `${p.when}-${p.subject}`} style={{ borderTop: "1px solid var(--vault-rule)" }}>
                <td className="font-mono py-2 pr-3" style={{ color: "var(--vault-text-faint)", whiteSpace: "nowrap" }}>{p.when}</td>
                <td className="py-2 pr-3" style={{ color: "var(--vault-text)" }}>{p.subject}</td>
                <td className="py-2 pr-3" style={{ color: "var(--vault-text-mute)" }}>
                  {p.predicted}
                  {p.modelProbability != null ? <span className="font-mono" style={{ color: "var(--vault-text-faint)" }}> · {pct(p.modelProbability)}</span> : null}
                </td>
                <td className="py-2 pr-3" style={{ color: "var(--vault-text-mute)" }}>{p.actual ?? "—"}</td>
                <td className="py-2"><Outcome hit={p.hit} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {c.total > rows ? (
        <p className="mt-2 font-mono" style={{ fontSize: 11, color: "var(--vault-text-faint)" }}>
          {/* The list is not the record: counts are over every graded pick, the rows are a slice. */}
          Showing the {rows} most recent of {c.counted.toLocaleString()} graded.
        </p>
      ) : null}
    </section>
  );
}
