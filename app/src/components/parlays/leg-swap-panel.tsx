"use client";
import { useState } from "react";
import PlayerAvatar from "@/components/ui/player-avatar";
import TeamLogo from "@/components/team-logo";
import {
  benchFor, repriceCard, bandFor, decimalOdds, toAmerican,
  type SwapCandidate, type SwapTarget,
} from "@/lib/parlays/leg-swap";

/**
 * THE SUBSTITUTION PANEL — bring a leg off, bring a comparable one on.
 *
 * Modelled on a substitution rather than a leaderboard, and the distinction is not cosmetic: the
 * bench is like-for-like (same market, comparable price, no game already on the card) because
 * nothing we hold ranks one candidate above another honestly. Edge does not predict outcomes over
 * 1,407 graded legs, and legs land below their own implied price in every price band.
 *
 * So the panel deliberately does NOT say "better". It shows what each substitution does to the
 * card's price and to its risk band, and lets the reader decide. A control that promised an upgrade
 * would be inventing a signal we have measured and failed to find.
 */

const american = (n: number) => `${n > 0 ? "+" : ""}${n}`;
const BAND_LABEL: Record<string, string> = { low: "Low risk", medium: "Medium risk", high: "High risk", longshot: "Longshot" };

export interface SwapLegView extends SwapTarget {
  readonly marketLabel: string;
  readonly side: string;
  readonly line: number | null;
  readonly photoUrl?: string | null;
  readonly teamAbbr?: string | null;
}

export default function LegSwapPanel({
  legs, index, pool, sport = "mlb", onSwap,
}: {
  legs: readonly SwapLegView[];
  index: number;
  pool: readonly SwapCandidate[];
  sport?: "mlb" | "nfl" | "nba" | "nhl" | "soccer";
  /** Applied by the caller — this panel never mutates a published card. */
  onSwap: (incoming: SwapCandidate) => void;
}) {
  const [open, setOpen] = useState(false);
  const target = legs[index];
  if (!target) return null;

  const bench = open ? benchFor(pool, target, legs) : [];
  const currentPrice = toAmerican(legs.reduce((d, l) => d * decimalOdds(l.americanOdds), 1));
  const currentBand = bandFor(currentPrice);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Substitute ${target.player}`}
        title="Substitute this leg"
        className="gtp-slip-btn shrink-0 rounded-[6px] font-mono"
        style={{
          padding: "3px 7px", fontSize: 10, cursor: "pointer",
          color: open ? "#06140D" : "var(--vault-text-mute)",
          background: open ? "var(--gtp-bank-heat)" : "rgba(255,255,255,0.03)",
          border: `1px solid ${open ? "transparent" : "var(--vault-rule)"}`,
        }}
      >
        ⇄
      </button>

      {open && (
        <div className="mt-1.5 flex flex-col gap-1.5 rounded-[10px] p-2.5"
          style={{ background: "rgba(0,0,0,0.28)", border: "1px solid var(--vault-rule)" }}>
          <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
            Bench · same market, comparable price
          </span>

          {bench.length === 0 ? (
            <span style={{ color: "var(--vault-text-mute)", fontSize: 11.5 }}>
              No like-for-like replacement on today&rsquo;s slate — every other {target.marketLabel.toLowerCase()} leg
              is either on this card already or from a game it already uses.
            </span>
          ) : (
            <ul className="flex flex-col gap-1 list-none m-0 p-0">
              {bench.map((cand) => {
                const next = repriceCard(legs, index, cand.americanOdds);
                const nextBand = bandFor(next);
                const bandMoved = nextBand !== currentBand;
                return (
                  <li key={`${cand.player}|${cand.line}|${cand.gameId}`}>
                    <button
                      type="button"
                      onClick={() => { onSwap(cand); setOpen(false); }}
                      className="gtp-team-row w-full flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-left"
                      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-rule)", cursor: "pointer" }}
                    >
                      <span className="relative shrink-0">
                        <PlayerAvatar name={cand.player} photo={cand.photoUrl} size={20} />
                        {cand.teamAbbr ? <span className="absolute -bottom-1 -right-1"><TeamLogo team={cand.teamAbbr} sport={sport} size="sm" /></span> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold leading-tight" style={{ color: "var(--vault-text)", fontSize: 11.5 }}>
                          {cand.player}
                        </span>
                        <span className="block font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
                          {cand.side} {cand.line} {cand.marketLabel} · {american(cand.americanOdds)}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        {/* What the substitution DOES — never a claim that it is better. */}
                        <span className="block font-mono tabular-nums" style={{ color: "var(--vault-text)", fontSize: 11 }}>
                          {american(next)}
                        </span>
                        <span className="block font-mono" style={{ color: bandMoved ? "var(--vault-warn)" : "var(--vault-text-faint)", fontSize: 8.5 }}>
                          {bandMoved ? `→ ${nextBand ? BAND_LABEL[nextBand] : "off the ladder"}` : "same band"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <span style={{ color: "var(--vault-text-faint)", fontSize: 9.5, lineHeight: 1.5 }}>
            Ordered by how close each price is to the leg coming off — not by which is more likely to
            land. Nothing we measure ranks one of these above another.
          </span>
        </div>
      )}
    </>
  );
}
