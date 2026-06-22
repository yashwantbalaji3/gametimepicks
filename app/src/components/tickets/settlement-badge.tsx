/**
 * SettlementBadge — leg-level official outcome (HIT / MISS / PENDING) with the official evidence line.
 * Used in LegRow. Never fabricates a result: "pending" until an official settlement is supplied.
 */
import StatusPill from "./status-pill";

export type LegResult = "hit" | "miss" | "pending" | "void" | null | undefined;

/** Normalize the various result encodings used across artifacts ("won"/"lost"/"hit"/"miss"). */
export function normalizeLegResult(result?: string | null, settlementStatus?: string | null): LegResult {
  const s = (settlementStatus ?? result ?? "").toLowerCase();
  if (s === "hit" || s === "won") return "hit";
  if (s === "miss" || s === "lost") return "miss";
  if (s === "void") return "void";
  return "pending";
}

export default function SettlementBadge({
  result, official, className = "",
}: { result: LegResult; official?: string | null; className?: string }) {
  const status = result === "hit" ? "hit" : result === "miss" ? "miss" : result === "void" ? "void" : "pending";
  return (
    <span className={`inline-flex flex-col items-end gap-0.5 ${className}`}>
      <StatusPill status={status} />
      {official ? (
        <span className="font-mono text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>{official}</span>
      ) : null}
    </span>
  );
}
