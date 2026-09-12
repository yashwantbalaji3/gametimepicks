"use client";
import { recordForLeg } from "@/lib/parlays/lab/leg-record.mjs";

/**
 * HOW LEGS LIKE THESE HAVE SETTLED (P268).
 *
 * The card-level record is published per risk tier and per price band. This is the level a person is
 * actually choosing at — the leg — and it comes from the graded receipts: officially settled, one
 * observation per leg per day, with the price those legs carried.
 *
 * THE SENTENCE THAT CANNOT BE DROPPED: this is the record of the legs OUR CARDS USED, not of the
 * market. The engine chose them. A reader who takes it as "Over 0.5 hits lands 59% of the time" has
 * been misled by us, so the caption says whose legs these were and how many there have been.
 */

export interface LegFamilyRow {
  readonly market: string | null;
  readonly side: string | null;
  readonly line: number | null;
  readonly label: string;
  readonly decided: number;
  readonly wins: number;
  readonly losses: number;
  readonly hitRate: number | null;
  readonly impliedMean: number | null;
  readonly flatReturn: number | null;
  readonly sample: { readonly id: string; readonly text: string };
}

export interface LegRecordView {
  readonly since: string | null;
  readonly until: string | null;
  readonly distinct: number;
  readonly families: readonly LegFamilyRow[];
}

const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(0)}%`);
const signed = (v: number | null) => (v == null ? "—" : `${v < 0 ? "−" : "+"}${Math.abs(v * 100).toFixed(1)}%`);

/** The families present in a set of legs, each once, in the order the legs appear. */
export function familiesFor(record: LegRecordView | null, legs: readonly { market?: string | null; side?: string | null; line?: number | null; point?: number | null }[]) {
  if (!record) return [];
  const out: LegFamilyRow[] = [];
  for (const leg of legs) {
    const row = recordForLeg(record, leg) as LegFamilyRow | null;
    if (row && !out.some((r) => r.label === row.label)) out.push(row);
  }
  return out;
}

export default function LegRecordList({
  rows, since, heading = "How legs like these have settled", max = 4,
}: {
  rows: readonly LegFamilyRow[];
  since?: string | null;
  heading?: string;
  max?: number;
}) {
  if (!rows.length) return null;
  return (
    <section aria-label={heading} className="flex flex-col gap-1.5">
      <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
        {heading}
      </span>
      <ul className="flex flex-col gap-1.5 list-none m-0 p-0">
        {rows.slice(0, max).map((r) => (
          <li key={r.label} className="rounded-[8px] px-2.5 py-1.5" style={{ background: "var(--vault-wash-faint)", border: "1px solid var(--vault-rule)" }}>
            <span className="block font-semibold" style={{ color: "var(--vault-text)", fontSize: 11.5 }}>{r.label}</span>
            {/* The same two numbers the sentence below states, on one 0–100% scale so the gap between
                what landed and what the price implied is visible rather than arithmetic the reader has
                to do. Decorative and NOT animated: these are settled, published figures, and a bar
                that grows on load would dress a completed past as something happening now. */}
            {r.hitRate != null && r.impliedMean != null ? (
              <span aria-hidden="true" className="block relative" style={{ height: 6, margin: "4px 0 3px", borderRadius: 3, background: "var(--vault-scrim-base)", overflow: "hidden" }}>
                <span className="absolute inset-y-0 left-0" style={{ width: `${Math.min(100, r.hitRate * 100)}%`, background: "var(--gtp-bank-heat)", opacity: 0.75, borderRadius: 3 }} />
                <span className="absolute inset-y-0" style={{ left: `${Math.min(100, r.impliedMean * 100)}%`, width: 2, background: "var(--vault-text)", opacity: 0.85 }} />
              </span>
            ) : null}
            <span className="block tabular-nums" style={{ color: "var(--vault-text-mute)", fontSize: 11, lineHeight: 1.5 }}>
              {r.wins} of {r.decided} landed ({pct(r.hitRate)}) · their prices implied {pct(r.impliedMean)} ·{" "}
              a flat stake on every one returned {signed(r.flatReturn)}
            </span>
            <span className="block" style={{ color: "var(--vault-text-faint)", fontSize: 10.5, lineHeight: 1.45 }}>{r.sample.text}</span>
          </li>
        ))}
      </ul>
      <p className="m-0" style={{ color: "var(--vault-text-faint)", fontSize: 10.5, lineHeight: 1.5 }}>
        The bar is what landed; the upright mark is what the prices implied. These are the legs <strong>our own published cards used</strong>{since ? ` since ${since}` : ""}, settled from official
        results — one count per leg per day, not per card. They are not a record of the market, and not a forecast of the
        leg you are looking at.
      </p>
    </section>
  );
}
