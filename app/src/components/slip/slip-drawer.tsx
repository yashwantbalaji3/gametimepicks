"use client";
import { useState } from "react";
import PlayerAvatar from "@/components/ui/player-avatar";
import TeamLogo from "@/components/team-logo";
import { useSlip, combinedDecimal, decimalOdds, toAmerican } from "@/lib/slip/slip-store";

/**
 * THE SLIP DRAWER — what a reader has picked out, what each would return, and what the whole set
 * would return as one parlay.
 *
 * Both numbers are shown because they answer different questions and the difference between them is
 * the entire point of a parlay: five singles returning a little each, versus one ticket that pays
 * far more and needs every leg. A drawer that showed only the combined price would be selling the
 * parlay; one that showed only singles would hide what the reader is actually assembling.
 *
 * Paper throughout. Nothing here is placed, transmitted, or recorded — the site's own record is
 * generated server-side and a visitor's shortlist can never touch it.
 */

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const american = (n: number) => `${n > 0 ? "+" : ""}${n}`;

/* The slip carries `sport` as an open string so it can hold an NFL or UFC leg the day those
   sports are eligible; TeamLogo only renders the leagues it has crest URLs for. Narrow here
   rather than constraining the store — an unknown sport simply shows no crest. */
const CREST_SPORTS = ["nba", "mlb", "nhl", "nfl", "soccer"] as const;
type CrestSport = (typeof CREST_SPORTS)[number];
const crestSport = (s: string): CrestSport | null =>
  (CREST_SPORTS as readonly string[]).includes(s) ? (s as CrestSport) : null;

export default function SlipDrawer() {
  const { legs, stakes, ready, remove, setStake, clear } = useSlip();
  const [open, setOpen] = useState(false);

  // Nothing to show, and nothing to announce, until there is a selection.
  if (!ready || legs.length === 0) return null;

  const totalStake = legs.reduce((n, l) => n + (stakes[l.key] ?? 0), 0);
  const singlesReturn = legs.reduce((n, l) => n + (stakes[l.key] ?? 0) * decimalOdds(l.americanOdds), 0);
  const parlayDecimal = combinedDecimal(legs);
  // One ticket across the whole slip is staked ONCE — the smallest single stake, so the comparison
  // never quietly inflates the parlay by staking it at the sum of the singles.
  const parlayStake = Math.min(...legs.map((l) => stakes[l.key] ?? 0));

  return (
    <div className="fixed z-40" style={{ right: 16, bottom: 16, maxWidth: "min(420px, calc(100vw - 32px))" }}>
      {open ? (
        <section
          aria-label="Your slip"
          className="flex flex-col gap-2.5 rounded-[14px] p-3.5"
          style={{
            background: "var(--vault-panel-elevated, rgba(11,18,14,0.97))",
            border: "1px solid var(--vault-border-strong)",
            boxShadow: "0 18px 50px -20px rgba(0,0,0,0.8)",
            maxHeight: "min(72vh, 640px)",
          }}
        >
          <header className="flex items-center gap-2">
            <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--gtp-bank-heat)", fontSize: 9.5 }}>
              Your slip · {legs.length}
            </span>
            <button type="button" onClick={clear}
              className="ml-auto font-mono uppercase tracking-[0.1em]"
              style={{ color: "var(--vault-text-faint)", fontSize: 9, background: "none", border: "none", cursor: "pointer" }}>
              Clear
            </button>
            <button type="button" onClick={() => setOpen(false)} aria-label="Collapse your slip"
              className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 13, background: "none", border: "none", cursor: "pointer" }}>
              ×
            </button>
          </header>

          <ul className="flex flex-col gap-2 list-none m-0 p-0 overflow-y-auto" style={{ maxHeight: "38vh" }}>
            {legs.map((l) => (
              <li key={l.key} className="flex items-center gap-2 rounded-[10px] px-2.5 py-2"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-rule)" }}>
                <span className="relative shrink-0">
                  <PlayerAvatar name={l.player} photo={l.photoUrl ?? null} size={22} />
                  {l.teamAbbr && crestSport(l.sport) ? <span className="absolute -bottom-1 -right-1"><TeamLogo team={l.teamAbbr} sport={crestSport(l.sport)!} size="sm" /></span> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold leading-tight" style={{ color: "var(--vault-text)", fontSize: 12 }}>{l.player}</span>
                  <span className="block font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
                    {l.side} {l.line} {l.marketLabel} · {american(l.americanOdds)}
                  </span>
                </span>
                <label className="shrink-0 inline-flex items-center rounded-[6px]"
                  style={{ background: "var(--gtp-card-sunken, rgba(0,0,0,0.3))", border: "1px solid var(--vault-rule)" }}>
                  <span className="sr-only">Paper stake for {l.player}</span>
                  <span aria-hidden className="pl-1.5 font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>$</span>
                  <input
                    type="number" min={0} step={5} inputMode="decimal"
                    value={stakes[l.key] ?? 0}
                    onChange={(e) => setStake(l.key, Number(e.target.value))}
                    className="font-mono tabular-nums bg-transparent"
                    style={{ width: 46, padding: "3px 5px 3px 2px", color: "var(--vault-text)", fontSize: 11, border: "none", outline: "none" }}
                  />
                </label>
                <button type="button" onClick={() => remove(l.key)} aria-label={`Remove ${l.player}`}
                  style={{ color: "var(--vault-text-faint)", fontSize: 13, background: "none", border: "none", cursor: "pointer" }}>
                  ×
                </button>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-1.5 pt-2" style={{ borderTop: "1px solid var(--vault-rule)" }}>
            <div className="flex items-baseline justify-between">
              <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
                As {legs.length} singles · {money(totalStake)} staked
              </span>
              <span className="font-mono tabular-nums" style={{ color: "var(--vault-text)", fontSize: 12 }}>
                {money(singlesReturn)} if all land
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
                As one parlay · {money(parlayStake)} staked
              </span>
              <span className="font-mono tabular-nums" style={{ color: "var(--gtp-bank-heat)", fontSize: 12, fontWeight: 700 }}>
                {money(parlayStake * parlayDecimal)} at {american(toAmerican(parlayDecimal))}
              </span>
            </div>
            <p className="m-0" style={{ color: "var(--vault-text-faint)", fontSize: 10, lineHeight: 1.5 }}>
              A parlay pays more and needs every leg. Paper only — nothing here is placed, sent
              anywhere, or added to the site&rsquo;s record.
            </p>
          </div>
        </section>
      ) : (
        <button type="button" onClick={() => setOpen(true)}
          className="gtp-sim-cta flex items-center gap-2 rounded-[12px] px-3.5 py-2.5"
          style={{ background: "var(--vault-panel-elevated, rgba(11,18,14,0.97))", border: "1px solid var(--vault-border-strong)", boxShadow: "0 12px 34px -18px rgba(0,0,0,0.8)", cursor: "pointer" }}>
          <span aria-hidden style={{ fontSize: 14 }}>🧾</span>
          <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text)", fontSize: 10 }}>
            Your slip · {legs.length}
          </span>
        </button>
      )}
    </div>
  );
}
