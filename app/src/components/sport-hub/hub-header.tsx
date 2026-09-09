import GameSummary from "./game-summary";
import type { SportHubModel } from "@/lib/sport-hub/contract";

/**
 * The top of every sport page, in two pieces with the sticky section strip between them.
 *
 * WHY TWO PIECES. The strip (`SportHubNav`) is `position: sticky`. Rendered immediately before a
 * combined header it overlapped the `<h1>` by 29px at rest — the heading sat underneath the bar
 * before the page had been scrolled at all. Splitting the title out puts it ABOVE the sticky
 * element, where nothing can ride over it, and gives the charter's order exactly: title and period,
 * then the controls, then the events.
 *
 * DELIBERATELY SMALL. What this replaces, on three of the four pages, is several paragraphs before
 * the first row a reader can act on. Methodology and limitations keep their existing places further
 * down; nothing was deleted to make room.
 */

export function HubTitle({ model }: { model: SportHubModel }) {
  const freshLabel = model.freshness
    ? new Date(model.freshness).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET"
    : null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h1 className="m-0 font-display tracking-tight text-[22px] sm:text-[26px] font-bold" style={{ color: "var(--vault-text)" }}>
        {model.sportLabel}
      </h1>
      <span className="text-[14px]" style={{ color: "var(--vault-text)" }}>{model.periodLabel}</span>
      {/* The RANGE prints whenever it differs from the label, so a week is never read as a day. */}
      {model.periodRange && model.periodRange !== model.periodLabel ? (
        <span className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>{model.periodRange}</span>
      ) : null}
      <span className="text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
        times in ET{freshLabel ? ` · updated ${freshLabel}` : ""}
      </span>
    </div>
  );
}

export default function HubHeader({ model, deferToCanonical }: {
  model: SportHubModel;
  /**
   * P250-W1 (audit item E): when the page below carries its OWN canonical event table for the same
   * period (NFL's weekly table with projected scores/totals), the hub's generic list is a second
   * 16-row copy of the same games directly above the richer one. This renders the counts line and
   * keeps the quick list one click away — the same collapsed shape the settled-window state uses —
   * instead of two tables of one population.
   */
  deferToCanonical?: { note: string };
}) {
  if (deferToCanonical && model.periodLabel !== "Settled window" && model.rows.length > 0) {
    const counts = { scheduled: model.rows.length, withReport: model.rows.filter((r) => r.reportState !== "NONE").length };
    return (
      <details className="rounded-[12px]" style={{ border: "1px solid var(--vault-border)", background: "var(--vault-wash-faint)" }}>
        <summary className="cursor-pointer px-4 py-3 text-[13.5px]" style={{ color: "var(--vault-text-mute)", minHeight: 44 }}>
          <span className="font-semibold" style={{ color: "var(--vault-text)" }}>{model.labels.games}</span>
          {" · "}{counts.scheduled} scheduled · {counts.withReport} with a report — open the quick list
        </summary>
        <div className="px-4 pb-4">
          <p className="m-0 mb-2 text-[12px]" style={{ color: "var(--vault-text-faint)" }}>{deferToCanonical.note}</p>
          <GameSummary rows={model.rows} unitLabel={model.labels.games} emptyReason={model.emptyReason} />
        </div>
      </details>
    );
  }
  /*
   * A SETTLED WINDOW IS AN ARCHIVE, NOT THE FRONT TABLE (P241 · A04). On the first regular-season
   * morning, /nfl opened with a 22-row August preseason table — every row started-or-final —
   * before the reader ever saw the current week. The adapter already knows this state
   * (periodLabel "Settled window"); the shared contract keeps the table, one click away, and lets
   * the current period lead. A live window renders exactly as before.
   */
  if (model.periodLabel === "Settled window") {
    return (
      <details className="rounded-[12px]" style={{ border: "1px solid var(--vault-border)", background: "var(--vault-wash-faint)" }}>
        <summary className="cursor-pointer px-4 py-3 text-[13.5px] font-semibold" style={{ color: "var(--vault-text-mute)" }}>
          Settled window{model.periodRange ? ` · ${model.periodRange}` : ""} — open the archive table
          ({model.rows.length} {model.labels.games.toLowerCase()})
        </summary>
        <div className="px-4 pb-4">
          <GameSummary rows={model.rows} unitLabel={model.labels.games} emptyReason={model.emptyReason} />
        </div>
      </details>
    );
  }
  return (
    <div>
      <h2 className="m-0 mb-3 text-[15px] font-semibold" style={{ color: "var(--vault-text)" }}>{model.labels.games}</h2>
      <GameSummary rows={model.rows} unitLabel={model.labels.games} emptyReason={model.emptyReason} />
    </div>
  );
}
