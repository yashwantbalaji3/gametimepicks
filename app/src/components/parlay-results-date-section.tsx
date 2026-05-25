"use client";
/**
 * ParlayResultsDateSection — one collapsible-ish section per date on
 * the Results page. Renders the date header + slip counts + a stack
 * of ParlayTicketCards (each leg clickable for recent form).
 *
 * Client component because the recent-form drawer needs interactive
 * state.
 */
import { useState } from "react";
import ParlayTicketCard from "./parlay-ticket-card";
import PlayerRecentFormDrawer from "./player-recent-form-drawer";
import type { ParlaySlip, ParlayLeg } from "@/lib/parlay-suggested";
import type { CalibrationTable } from "@/lib/confidence-calibration-rules";

interface Totals {
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
}

interface Props {
  date: string;
  slips: ParlaySlip[];
  totals: Totals | null;
  calibrationTable?: CalibrationTable;
}

export default function ParlayResultsDateSection({
  date,
  slips,
  totals,
  calibrationTable,
}: Props) {
  const [activeLeg, setActiveLeg] = useState<ParlayLeg | null>(null);
  const decisive = (totals?.wins ?? 0) + (totals?.losses ?? 0);
  const hitRate = decisive > 0 ? (totals?.wins ?? 0) / decisive : null;
  return (
    <section className="flex flex-col gap-3" aria-label={`Results for ${date}`}>
      <header className="flex flex-wrap items-baseline gap-3">
        <span
          className="font-mono uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-gold)", fontSize: 11 }}
        >
          {date}
        </span>
        {totals && (
          <span
            className="font-mono"
            style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
          >
            {totals.wins}W · {totals.losses}L
            {totals.pushes > 0 ? ` · ${totals.pushes}P` : ""}
            {totals.pending > 0 ? ` · ${totals.pending} pending` : ""}
            {hitRate != null ? ` · ${(hitRate * 100).toFixed(1)}%` : ""}
          </span>
        )}
        <div
          className="flex-1 h-px"
          style={{ background: "var(--vault-rule)" }}
        />
      </header>
      {slips.length === 0 ? (
        <p
          className="text-[12px] leading-relaxed"
          style={{ color: "var(--vault-text-faint)" }}
        >
          No graded slips for this date yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {slips.map((slip) => (
            <ParlayTicketCard
              key={slip.slipId}
              slip={slip}
              savedPregame={false}
              calibrationTable={calibrationTable}
              onLegClick={setActiveLeg}
            />
          ))}
        </div>
      )}
      <PlayerRecentFormDrawer leg={activeLeg} onClose={() => setActiveLeg(null)} />
    </section>
  );
}
