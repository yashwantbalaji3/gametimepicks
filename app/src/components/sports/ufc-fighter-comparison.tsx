/**
 * Bout page, section D: fighter comparison (UFC-001 UX Phase B).
 *
 * A real table — row headers name the measure and its source, column headers name the fighters — so a screen reader
 * announces "Reach, Brendan Allen, 75 in" rather than a loose number. Three columns keep it inside a phone's width.
 * Rows come from `comparisonRows` (lib/sports/ufc/bout-comparison.mjs); a missing value prints "—" and its reason.
 */
type Cell = { display: string | null; reason: string | null };
export type ComparisonRow = { key: string; label: string; source: string; asOf: string | null; red: Cell; blue: Cell };

function Value({ c }: { c: Cell }) {
  if (c.display != null) return <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--vault-text)", fontVariantNumeric: "tabular-nums" }}>{c.display}</span>;
  return (
    <span className="flex flex-col gap-0.5">
      <span aria-hidden style={{ fontSize: 13.5, color: "var(--vault-text-faint)" }}>—</span>
      <span style={{ fontSize: 11, lineHeight: 1.45, color: "var(--vault-text-faint)" }}>
        <span className="sr-only">Not available: </span>{c.reason}
      </span>
    </span>
  );
}

export default function UfcFighterComparison({ redName, blueName, rows, caveat }: {
  redName: string;
  blueName: string;
  rows: ComparisonRow[];
  caveat?: string | null;
}) {
  const cell: React.CSSProperties = { padding: "9px 8px", verticalAlign: "top", borderTop: "1px solid var(--vault-rule)", overflowWrap: "anywhere" };
  return (
    <div data-bout-section="comparison">
      <table className="w-full" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
        <caption className="sr-only">Fighter comparison: {redName} and {blueName}, with the source and date of each row</caption>
        <colgroup>
          <col style={{ width: "36%" }} />
          <col style={{ width: "32%" }} />
          <col style={{ width: "32%" }} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="font-mono uppercase tracking-[0.1em]" style={{ ...cell, borderTop: "none", textAlign: "left", fontSize: 9, fontWeight: 600, color: "var(--vault-text-faint)" }}>Measure</th>
            <th scope="col" style={{ ...cell, borderTop: "none", textAlign: "left", fontSize: 12.5, fontWeight: 700, color: "var(--vault-text)" }}>{redName}</th>
            <th scope="col" style={{ ...cell, borderTop: "none", textAlign: "left", fontSize: 12.5, fontWeight: 700, color: "var(--vault-text)" }}>{blueName}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} data-compare-row={r.key}>
              <th scope="row" style={{ ...cell, textAlign: "left", fontWeight: 400 }}>
                <span className="block" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--vault-text)" }}>{r.label}</span>
                <span className="block font-mono" style={{ fontSize: 10, lineHeight: 1.45, color: "var(--vault-text-faint)", marginTop: 2 }}>
                  {r.source}{r.asOf ? ` · as of ${r.asOf}` : " · date unknown"}
                </span>
              </th>
              <td style={cell}><Value c={r.red} /></td>
              <td style={cell}><Value c={r.blue} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {caveat ? (
        <p className="m-0 mt-3" style={{ fontSize: 11.5, lineHeight: 1.6, color: "var(--vault-text-faint)" }}>
          Tale of the tape: {caveat}
        </p>
      ) : null}
      <p className="m-0 mt-1.5" style={{ fontSize: 11.5, lineHeight: 1.6, color: "var(--vault-text-faint)" }}>
        No striking or grappling averages are shown: there is no reliable point-in-time source for them yet.
      </p>
    </div>
  );
}
