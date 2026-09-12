"use client";

/**
 * HOW MANY LEGS (P271) — our published cards by the number of legs they carried.
 *
 * The question a builder is actually asking when they add a fifth leg, answered with the only thing
 * that can answer it honestly: what happened to our own cards of each size. The row for the card
 * being built is marked, so the cost of one more leg is a comparison and not a memory test.
 *
 * The same rule as everywhere else in this directory: a rate never renders without its sample
 * caption, and the copy says whose cards these were.
 */

export interface ShapeRow {
  readonly legs: number;
  readonly cards: number;
  readonly wins: number;
  readonly losses: number;
  readonly hitRate: number | null;
  readonly flatReturn: number | null;
  readonly sample: { readonly id: string; readonly text: string };
}

export interface ShapeRecordView {
  readonly cards: number;
  readonly sizes: readonly ShapeRow[];
}

const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(0)}%`);
const signed = (v: number | null) => (v == null ? "—" : `${v < 0 ? "−" : "+"}${Math.abs(v * 100).toFixed(1)}%`);

export default function CardShapeList({
  rows, highlight = null, heading = "How many legs, in our own record",
}: {
  rows: readonly ShapeRow[];
  /** The size of the card being built, marked in the list. */
  highlight?: number | null;
  heading?: string;
}) {
  if (!rows.length) return null;
  const worst = Math.min(...rows.map((r) => r.flatReturn ?? 0));
  return (
    <section aria-label={heading} className="flex flex-col gap-1.5">
      <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{heading}</span>
      <ul className="flex flex-col gap-1 list-none m-0 p-0">
        {rows.map((r) => {
          const here = highlight != null && r.legs === highlight;
          return (
            <li key={r.legs} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-[8px] px-2.5 py-1.5"
              style={{
                background: here ? "var(--vault-wash-soft)" : "transparent",
                border: `1px solid ${here ? "var(--vault-border-strong)" : "var(--vault-rule)"}`,
              }}>
              <span className="font-semibold tabular-nums" style={{ color: "var(--vault-text)", fontSize: 12, minWidth: 52 }}>
                {r.legs} leg{r.legs === 1 ? "" : "s"}
              </span>
              {/* One scale for every row, so "one more leg" is a length the reader can see. The
                  widest bar is the worst return, because every size lost. */}
              <span aria-hidden="true" className="block" style={{ height: 5, flex: "1 1 90px", minWidth: 60, borderRadius: 3, background: "var(--vault-scrim-base)", overflow: "hidden" }}>
                <span className="block" style={{
                  width: `${worst < 0 ? Math.min(100, ((r.flatReturn ?? 0) / worst) * 100) : 0}%`,
                  height: "100%", borderRadius: 3, background: "var(--vault-danger)", opacity: here ? 0.95 : 0.55,
                }} />
              </span>
              <span className="tabular-nums" style={{ color: "var(--vault-text-mute)", fontSize: 11.5 }}>
                {r.wins} of {r.cards} landed ({pct(r.hitRate)}) · flat stake {signed(r.flatReturn)}
              </span>
              <span style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>{r.sample.text}</span>
              {here ? (
                <span className="font-mono uppercase" style={{ color: "var(--gtp-bank-heat)", fontSize: 9, letterSpacing: "0.1em" }}>your card</span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="m-0" style={{ color: "var(--vault-text-faint)", fontSize: 10.5, lineHeight: 1.5 }}>
        <strong>Our own published cards</strong>, graded from official results and priced as they were published. A
        scratched leg leaves a card, so both the size and the price above are the legs that actually settled. This is
        not a statement about parlays in general, and not a forecast for the card you are building.
      </p>
    </section>
  );
}
