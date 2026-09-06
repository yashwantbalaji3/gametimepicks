import GameSummary from "./game-summary";
import type { SportHubModel } from "@/lib/sport-hub/contract";

/**
 * The top of every sport page: what sport, what period, how fresh — then the events themselves.
 *
 * The section strip is NOT here: `SportHubNav` already owns it, sticky and observer-driven, and a
 * second nav band would be exactly the conflicting navigation this work exists to remove.
 *
 * DELIBERATELY SMALL. What this replaces, on three of the four pages, is several paragraphs before
 * the first row a reader can act on. The header is four facts on one line and the summary begins
 * inside the first viewport. Methodology and limitations keep their existing places further down;
 * nothing was deleted to make room.
 */
export default function HubHeader({ model }: { model: SportHubModel }) {
  const { periodLabel, periodRange, freshness, labels } = model;
  const freshLabel = freshness
    ? new Date(freshness).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET"
    : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="m-0 font-display tracking-tight text-[22px] sm:text-[26px] font-bold" style={{ color: "var(--vault-text)" }}>
          {model.sportLabel}
        </h1>
        <span className="text-[14px]" style={{ color: "var(--vault-text)" }}>{periodLabel}</span>
        {/* The RANGE is printed whenever it differs from the label, so a week is never read as a day. */}
        {periodRange && periodRange !== periodLabel ? (
          <span className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>{periodRange}</span>
        ) : null}
        <span className="text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
          times in ET{freshLabel ? ` · updated ${freshLabel}` : ""}
        </span>
      </div>

      {/* The ANCHOR belongs to the page, not to this component: a repo guard checks that every
          registry anchor appears in its own page's source with scroll margin, and an id computed
          inside a shared component is invisible to it — the computed-value blindness that has
          defeated guards here before. Each page wraps this in its own `<section id="<sport>-games">`. */}
      <div>
        <h2 className="m-0 mb-3 text-[15px] font-semibold" style={{ color: "var(--vault-text)" }}>{labels.games}</h2>
        <GameSummary rows={model.rows} unitLabel={labels.games} emptyReason={model.emptyReason} />
      </div>
    </div>
  );
}
