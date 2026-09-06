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

export default function HubHeader({ model }: { model: SportHubModel }) {
  return (
    <div>
      <h2 className="m-0 mb-3 text-[15px] font-semibold" style={{ color: "var(--vault-text)" }}>{model.labels.games}</h2>
      <GameSummary rows={model.rows} unitLabel={model.labels.games} emptyReason={model.emptyReason} />
    </div>
  );
}
