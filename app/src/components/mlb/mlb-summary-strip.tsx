import type { MlbBoardData } from "@/lib/types-mlb";

/**
 * Top status strip for the MLB board.
 * Mirrors the NBA "Schedule live · model leans available" rail but with
 * MLB-specific labels. Pure presentation; reads values straight from the
 * board payload.
 */
interface Props {
  board: MlbBoardData;
}

export default function MlbSummaryStrip({ board }: Props) {
  const isPending = !board.propsAvailable;
  const scheduleLabel = board.scheduleAvailable ? "live" : "pending";
  const leansLabel = isPending ? "pending" : "available";
  const generated = new Date(board.generatedAt);
  const generatedDisplay = Number.isNaN(generated.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "America/New_York",
      }).format(generated) + " ET";

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px]" style={{ color: "var(--vault-text-faint)" }}>
      <span className="inline-flex items-center gap-2" style={{ color: "var(--vault-text-mute)" }}>
        <span aria-hidden className="live-dot" />
        <span style={{ color: "var(--vault-gold-bright)", letterSpacing: "0.16em" }}>SCHEDULE</span>
        <span>{scheduleLabel}</span>
      </span>
      <span aria-hidden className="hidden sm:inline-block w-px h-3" style={{ background: "var(--vault-border-strong)" }} />
      <span className="inline-flex items-center gap-2">
        <span style={{ color: "var(--vault-gold-bright)", letterSpacing: "0.16em" }}>MODEL LEANS</span>
        <span>{leansLabel}</span>
      </span>
      <span aria-hidden className="hidden sm:inline-block w-px h-3" style={{ background: "var(--vault-border-strong)" }} />
      <span className="inline-flex items-center gap-2">
        <span style={{ color: "var(--vault-gold-bright)", letterSpacing: "0.16em" }}>UPDATED</span>
        <span>{generatedDisplay}</span>
      </span>
      <span aria-hidden className="hidden sm:inline-block w-px h-3" style={{ background: "var(--vault-border-strong)" }} />
      <span className="inline-flex items-center gap-2 uppercase tracking-[0.12em]">
        <span>educational analytics only</span>
      </span>
    </div>
  );
}
