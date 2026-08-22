/**
 * THE PARLAY LAB'S RECORD — every suggested card, every sport, one page.
 *
 * The Lab publishes a card per price band per sport every day and nothing told a reader how those
 * cards had done. /results/parlays tracks SAVED SLIPS — cards a reader built and kept — which is a
 * different population answering a different question, and it was the only parlay record on the
 * site. The Lab's own suggestions were published, settled into dated receipts, and summarised
 * nowhere.
 *
 * This page shows the number it has rather than the number it would like. MLB's Lab record is 1-7.
 * Three of the four streams have settled nothing at all, and say so instead of showing 0-0 — an
 * empty record and a record of no wins look identical in a table and mean opposite things.
 */
import type { Metadata } from "next";
import Link from "next/link";

import SectionHeader from "@/components/section-header";
import { loadLabRecord, labSampleCaption } from "@/lib/parlays/lab-record";

export const metadata: Metadata = {
  title: "Parlay Lab Record · GameTime Picks",
  description:
    "Every card the Parlay Lab has suggested, across every sport, with how each one settled. Paper-only and educational — no stake is filled in, and nothing here is a pick or a recommendation to wager.",
};

const pctOrDash = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);

export default function ParlayLabRecordPage() {
  const rec = loadLabRecord();

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-6">
      <SectionHeader
        eyebrow="Track record · Parlay Lab"
        title="Every card the Lab has suggested"
        sub="One card per price band per sport, published before the events start and graded from official results. This is the Lab's OWN suggestions — separate from saved slips, which are cards a reader built and kept."
      />

      {rec == null ? (
        <p className="mt-4" style={{ fontSize: 13, color: "var(--vault-text-mute)" }}>
          The Lab record could not be read. That is a fault on our side, not an empty record.
        </p>
      ) : (
        <>
          <p className="mt-3" style={{ fontSize: 13, lineHeight: 1.7, color: "var(--vault-text-mute)" }}>
            {labSampleCaption(rec)}
          </p>

          {/* ── PER SPORT ─────────────────────────────────────────────────────────────────────── */}
          <div className="mt-6 overflow-x-auto">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--vault-text-mute)" }}>
                  <th style={{ padding: "6px 10px", fontWeight: 600 }}>Sport</th>
                  <th style={{ padding: "6px 10px", fontWeight: 600 }}>Settled days</th>
                  <th style={{ padding: "6px 10px", fontWeight: 600 }}>Record</th>
                  <th style={{ padding: "6px 10px", fontWeight: 600 }}>Return</th>
                  <th style={{ padding: "6px 10px", fontWeight: 600 }}>Publishing today</th>
                </tr>
              </thead>
              <tbody>
                {rec.streams.map((s) => (
                  <tr key={s.id} style={{ borderTop: "1px solid var(--vault-rule)" }}>
                    <td style={{ padding: "8px 10px", fontWeight: 600 }}>{s.label}</td>
                    <td className="font-mono" style={{ padding: "8px 10px" }}>{s.settledDays}</td>
                    <td className="font-mono" style={{ padding: "8px 10px" }}>
                      {/* Null, not 0-0: this stream has graded nothing, which is not the same as
                          having graded cards and won none of them. */}
                      {s.record ? `${s.record.wins}–${s.record.losses}` : <span style={{ color: "var(--vault-text-faint)" }}>nothing settled</span>}
                    </td>
                    <td className="font-mono" style={{ padding: "8px 10px" }}>{s.record ? pctOrDash(s.record.roi) : "—"}</td>
                    <td style={{ padding: "8px 10px", color: "var(--vault-text-mute)" }}>
                      {s.live ? "yes" : <span title={s.blocked ?? undefined}>no — {s.blocked ? `${s.blocked.slice(0, 60)}…` : "closed"}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── EVERY GRADED CARD ─────────────────────────────────────────────────────────────── */}
          {rec.cards.length > 0 ? (
            <section className="mt-8">
              <SectionHeader
                eyebrow="Card by card"
                title={`${rec.cards.length} settled cards`}
                sub="The raw record behind the table above — every suggested card that has been graded, newest first."
              />
              <div className="mt-3 overflow-x-auto">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--vault-text-mute)" }}>
                      <th style={{ padding: "6px 10px", fontWeight: 600 }}>Date</th>
                      <th style={{ padding: "6px 10px", fontWeight: 600 }}>Sport</th>
                      <th style={{ padding: "6px 10px", fontWeight: 600 }}>Band</th>
                      <th style={{ padding: "6px 10px", fontWeight: 600 }}>Legs</th>
                      <th style={{ padding: "6px 10px", fontWeight: 600 }}>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rec.cards.map((c) => (
                      <tr key={c.slipId} style={{ borderTop: "1px solid var(--vault-rule)" }}>
                        <td className="font-mono" style={{ padding: "7px 10px" }}>{c.date}</td>
                        <td style={{ padding: "7px 10px", textTransform: "uppercase" }}>{c.sport}</td>
                        <td style={{ padding: "7px 10px" }}>{c.tier}</td>
                        <td className="font-mono" style={{ padding: "7px 10px", color: "var(--vault-text-mute)" }}>
                          {c.legs.length ? c.legs.join(" · ") : "—"}
                        </td>
                        <td className="font-mono" style={{ padding: "7px 10px", fontWeight: 700, color: c.result === "win" ? "var(--gtp-bank-cta)" : "var(--vault-text-mute)" }}>
                          {c.result.toUpperCase()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      )}

      <p className="mt-6" style={{ fontSize: 12, lineHeight: 1.7, color: "var(--vault-text-faint)" }}>
        Paper-only and educational. No stake is filled in anywhere on this site and nothing here is a pick
        or a recommendation to wager. Cards are published before their events start and graded from
        official results; a card that could not be graded is never published.
      </p>

      <nav className="mt-4 flex flex-wrap gap-3" style={{ fontSize: 12.5 }}>
        <Link href="/results" style={{ color: "var(--gtp-bank-cta)" }}>← All results</Link>
        <Link href="/results/parlays" style={{ color: "var(--vault-text-mute)" }}>Saved slips (a different record)</Link>
        <Link href="/build" style={{ color: "var(--vault-text-mute)" }}>Build a card</Link>
      </nav>
    </main>
  );
}
