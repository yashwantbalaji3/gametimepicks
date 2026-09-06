import Link from "next/link";
import { orderRows, hubCounts, type HubGameRow, type HubRead } from "@/lib/sport-hub/contract";

/**
 * The first thing on every sport page: what is on, what we think, and where to read it.
 *
 * TWO PRESENTATIONS, ONE INFORMATION PRIORITY. A table below `md`, squeezed, is the thing this
 * replaces — nested horizontal scrolling inside a page that also scrolls sideways. Mobile gets rows
 * as cards with the same order of importance; desktop gets the table. Neither hides a column.
 *
 * THE ACTION IS A LINK, not a row click. A whole-row handler cannot be tabbed to, cannot be opened
 * in a new tab, and swallows anything nested inside it. Each row's matchup IS the link, so keyboard
 * and middle-click both do what they should.
 */

const READ_TONE: Record<HubRead["kind"], { label: string; color: string }> = {
  MODEL_FORECAST: { label: "model forecast", color: "var(--vault-text)" },
  MODEL_PICK: { label: "model pick", color: "var(--vault-text)" },
  MARKET_PRICE: { label: "market price", color: "var(--vault-text-mute)" },
  BASELINE_ONLY: { label: "baseline only", color: "var(--vault-text-mute)" },
};

function ReadCell({ read }: { read: HubRead | null }) {
  if (!read) return <span style={{ color: "var(--vault-text-mute)" }}>No supported read</span>;
  const tone = READ_TONE[read.kind];
  return (
    <span>
      <span style={{ color: tone.color }}>{read.label}</span>
      {/* The KIND is never dropped. A market price and a model forecast reading alike on one row is
          how a de-vigged book number comes to be taken for a prediction. */}
      <span className="ml-2 text-[11px]" style={{ color: "var(--vault-text-mute)" }}>
        {tone.label}{read.detail ? ` · ${read.detail}` : ""}
      </span>
    </span>
  );
}

function Action({ row }: { row: HubGameRow }) {
  if (row.reportState === "NONE" || !row.reportHref) {
    return <span className="text-[12px]" style={{ color: "var(--vault-text-mute)" }}>{row.reportNote ?? "No report"}</span>;
  }
  return (
    <Link href={row.reportHref} className="text-[13px] font-medium no-underline" style={{ color: "var(--vault-cta)" }}>
      {row.reportState === "ARCHIVE" ? "View record" : "View report"}
      <span className="sr-only"> for {row.matchup}</span>
    </Link>
  );
}

export default function GameSummary({
  rows, unitLabel, emptyReason,
}: { rows: HubGameRow[]; unitLabel: string; emptyReason?: string }) {
  const ordered = orderRows(rows);
  const counts = hubCounts(rows);
  const upcoming = ordered.filter((r) => !r.started);
  const played = ordered.filter((r) => r.started);

  if (ordered.length === 0) {
    return (
      <p className="m-0 text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
        {emptyReason ?? `No ${unitLabel.toLowerCase()} are scheduled for this period.`}
      </p>
    );
  }

  const Rows = ({ list, heading }: { list: HubGameRow[]; heading?: string }) => (
    <>
      {heading ? (
        <h3 className="mt-6 mb-2 text-[13px] font-semibold" style={{ color: "var(--vault-text-mute)" }}>{heading}</h3>
      ) : null}

      {/* Mobile: one card per row, same priority as the table. */}
      <ul className="md:hidden m-0 p-0 list-none flex flex-col gap-2">
        {list.map((r) => (
          <li key={r.id} className="rounded-xl p-3" style={{ background: "var(--vault-surface)", border: "1px solid var(--vault-border)" }}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px]" style={{ color: "var(--vault-text-mute)" }}>{r.startLabel}</span>
              <span className="text-[11px]" style={{ color: "var(--vault-text-mute)" }}>{r.status}</span>
            </div>
            <div className="mt-1 text-[14px] font-semibold" style={{ color: "var(--vault-text)" }}>{r.matchup}</div>
            <div className="mt-1 text-[13px]"><ReadCell read={r.read} /></div>
            <div className="mt-2"><Action row={r} /></div>
          </li>
        ))}
      </ul>

      {/* Desktop: the table. It scrolls inside its own container, never the page. */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 640 }}>
          <thead>
            <tr style={{ color: "var(--vault-text-mute)" }}>
              <th scope="col" className="text-left font-medium py-2 pr-4">Start</th>
              <th scope="col" className="text-left font-medium py-2 pr-4">{unitLabel.replace(/s$/, "")}</th>
              <th scope="col" className="text-left font-medium py-2 pr-4">Status</th>
              <th scope="col" className="text-left font-medium py-2 pr-4">Our read</th>
              <th scope="col" className="text-left font-medium py-2">Report</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid var(--vault-border)" }}>
                <td className="py-2.5 pr-4 whitespace-nowrap" style={{ color: "var(--vault-text-mute)" }}>{r.startLabel}</td>
                <td className="py-2.5 pr-4" style={{ color: "var(--vault-text)" }}>
                  {r.reportHref && r.reportState !== "NONE"
                    ? <Link href={r.reportHref} className="no-underline font-medium" style={{ color: "var(--vault-text)" }}>{r.matchup}</Link>
                    : r.matchup}
                </td>
                <td className="py-2.5 pr-4" style={{ color: "var(--vault-text-mute)" }}>{r.status}</td>
                <td className="py-2.5 pr-4"><ReadCell read={r.read} /></td>
                <td className="py-2.5"><Action row={r} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  return (
    <div>
      {/* Counts a reader can check against the rows below. Scheduled and reportable are different
          numbers and are printed as different numbers. */}
      <p className="m-0 mb-3 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
        {counts.scheduled} scheduled · {counts.withReport} with a report · {counts.withRead} with a supported read
        {counts.started ? ` · ${counts.started} started or final` : ""}
      </p>
      {upcoming.length ? <Rows list={upcoming} /> : null}
      {played.length ? <Rows list={played} heading="Started or final" /> : null}
    </div>
  );
}
