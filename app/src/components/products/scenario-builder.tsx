"use client";
/**
 * SCENARIO BUILDER (founder directive 2026-11-15, P3 Bank Builder / P4 Moonshot) — the interactive card over the NFL leg
 * screen (lib/sports/nfl/leg-screen.mjs). The server ships the legs that PASSED the screen and the refusal counts; this
 * component only recombines them for the reader's starting amount and payout goal, using the same buildScenario().
 *
 * What it never does: invent a leg, a line, a price or a probability; add legs to reach a goal; multiply probabilities of
 * same-game legs; present a gross return as an expected result. Empty is a first-class state with the exact reasons.
 */
import React, { useMemo, useState } from "react";
import { AMOUNTS, GOAL_CAP, buildScenario } from "@/lib/sports/nfl/leg-screen.mjs";
import { etStamp } from "@/lib/et-stamp.mjs";
import { BOOK_AVAILABILITY_NOTE } from "@/lib/sports/odds/eligible-operators.mjs";

export type ScreenedLeg = {
  playerId: string; name: string | null; team: string; eventId: string; family: string; side: "over" | "under";
  line: { line: number; price: number; sportsbook: string; capturedAt: string }; tier: "5/5" | "4/5"; decimal: number; probability: number | null;
};
type Product = "bankBuilder" | "moonshot";

const PRODUCT = {
  bankBuilder: { title: "Bank Builder", goalDefault: 250, minLegs: 2, maxLegs: 4, blurb: "Fewer, steadier legs. Still a parlay: any one miss loses the whole stake." },
  moonshot: { title: "Moonshot", goalDefault: 250, minLegs: 2, maxLegs: 6, blurb: "Higher variance on purpose. A 100× scenario is a long shot that usually loses the whole stake." },
} as const;
const REASON: Record<string, string> = {
  NO_OBSERVED_LINE: "no sportsbook line captured before kickoff",
  NO_OBSERVED_PRICE: "a line but no price",
  INELIGIBLE_BOOK: "price from a book outside the eligible list",
  LINE_NOT_CAPTURED_BEFORE_KICKOFF: "line not captured before kickoff",
  NO_ELIGIBLE_BOOK_LIST: "no eligible-book list to check the price against",
  PLAYER_NOT_ELIGIBLE: "player not confirmed eligible to play",
  FAMILY_NOT_QUALIFIED: "market not yet qualified for products",
  SHORT_SAMPLE: "fewer than 5 games on record",
  INCOMPLETE_HISTORY: "a recent game with no stat line",
  TIER_3_OF_5_NEVER_USED: "only 3 of 5 against the line (never used)",
  TREND_BELOW_4_OF_5: "fewer than 3 of 5 against the line",
};
const FAMILY: Record<string, string> = { player_receptions: "receptions", player_reception_yds: "receiving yds", player_rush_yds: "rushing yds", player_pass_yds: "passing yds", anytime_td: "anytime TD" };
const usd = (v: number) => { const d = Number.isInteger(v) || v >= 100 ? 0 : 2; return v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d }); };
const am = (o: number) => (o > 0 ? `+${o}` : String(o));
const CSS = `
.sb{border:1px solid var(--vault-border-strong);border-radius:12px;padding:14px;display:grid;gap:12px}
.sb h3{margin:0;font-size:18px;color:var(--vault-text)}
.sb-mute{color:var(--vault-text-mute);font-size:12.5px;margin:0}
.sb-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.sb-chip{min-height:40px;min-width:56px;padding:0 12px;border-radius:999px;border:1px solid var(--vault-border);background:transparent;color:var(--vault-text);font-size:13px;cursor:pointer}
.sb-chip[aria-pressed="true"]{border-color:var(--vault-gold-bright);color:var(--vault-gold-bright)}
.sb input{min-height:40px;width:110px;background:var(--vault-bg);color:var(--vault-text);border:1px solid var(--vault-border);border-radius:8px;padding:0 8px;font-size:13px}
.sb-card{border:1px solid var(--vault-border);border-radius:10px;padding:12px;display:grid;gap:8px}
.sb-big{font-size:22px;font-weight:700;color:var(--vault-text);font-variant-numeric:tabular-nums}
.sb-leg{display:grid;grid-template-columns:1fr auto;gap:4px 10px;padding:8px 0;border-top:1px solid var(--vault-border);font-size:13px;color:var(--vault-text)}
.sb-leg small{color:var(--vault-text-mute);font-size:11.5px}
.sb-warn{color:var(--vault-warn);font-size:12.5px;margin:0}
.sb-x{min-height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--vault-border);background:transparent;color:var(--vault-text-mute);cursor:pointer}
.sb table{border-collapse:collapse;font-size:12.5px}
.sb td{padding:3px 8px 3px 0;color:var(--vault-text-mute)}
.sb td:first-child{text-align:right;font-variant-numeric:tabular-nums;color:var(--vault-text)}
`;

/** "4.5 at draftkings, captured Nov 15, 7:00 AM ET": the same caption shape as lib/sports/nfl/evidence-line.mjs, with the
 *  shared ET stamp. A leg exists only when its capture preceded kickoff (leg-screen rule 1). */
const legLine = (l: { line: number | null; sportsbook: string | null; capturedAt: string | null }) =>
  `${l.line ?? "?"} at ${l.sportsbook ?? "?"}, captured ${etStamp(l.capturedAt) ?? "at an unknown time"}`;

export default function ScenarioBuilder({ product, legs, candidates, refusedBy, asOf }: { product: Product; legs: ScreenedLeg[]; candidates: number; refusedBy: Record<string, number>; asOf: string | null }) {
  const cfg = PRODUCT[product];
  const amounts = AMOUNTS[product] as readonly number[];
  const cap = GOAL_CAP[product] as number;
  const [stake, setStake] = useState<number>(amounts[0]);
  const [goal, setGoal] = useState<number>(Math.min(cfg.goalDefault, cap));
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const key = (l: ScreenedLeg) => `${l.playerId}|${l.family}|${l.side}`;
  const pool = useMemo(() => legs.filter((l) => !removed.has(key(l))), [legs, removed]);
  const s = useMemo(() => buildScenario(pool, { stake, goal, minLegs: cfg.minLegs, maxLegs: cfg.maxLegs }) as any, [pool, stake, goal, cfg]);
  const safeGoal = (v: number) => (Number.isFinite(v) ? Math.max(stake, Math.min(cap, Math.round(v))) : goal);
  /* a goal at or below the stake is not a goal: raise it to 2× the stake (capped) whenever the stake passes it */
  const pickStake = (v: number) => { setStake(v); if (goal <= v) setGoal(Math.min(cap, Math.max(v * 2, goal))); };
  return (
    <section className="sb" aria-labelledby={`sb-${product}`} data-scenario-product={product}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div><h3 id={`sb-${product}`}>{cfg.title} scenario</h3><p className="sb-mute">{cfg.blurb} Amounts are hypothetical inputs, not advice and not a promise of any return.</p></div>
      <div className="sb-row" role="group" aria-label="Starting amount">
        {amounts.map((a) => <button key={a} type="button" className="sb-chip" aria-pressed={stake === a} onClick={() => pickStake(a)}>{usd(a)}</button>)}
        <label className="sb-mute">Custom <input type="number" min={1} max={cap} inputMode="decimal" value={stake} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v > 0) pickStake(Math.min(cap, v)); }} aria-label="Custom starting amount in dollars" /></label>
        <label className="sb-mute">Goal (up to {usd(cap)}) <input type="number" min={1} max={cap} value={goal} onChange={(e) => setGoal(safeGoal(Number(e.target.value)))} aria-label="Hypothetical gross payout goal in dollars" /></label>
      </div>

      {s.state === "BUILT" ? (
        <div className="sb-card" data-scenario-state="BUILT">
          <div className="sb-row" style={{ justifyContent: "space-between" }}>
            <span className="sb-mute">{s.legs.length} legs · {usd(stake)} start</span>
            <span className="sb-mute">{s.goalReached ? "reaches the goal" : `does not reach ${usd(goal)} with the qualifying legs`}</span>
          </div>
          <div><div className="sb-big">{usd(s.grossReturn)}</div><p className="sb-mute">Illustrative gross return if every leg wins, at the recorded prices (×{s.multiple}). Not a forecast.</p></div>
          <p className="sb-mute" data-joint={s.joint.state}>
            {s.joint.state === "INDEPENDENT_GAMES" ? `Model chance all legs win: ${(s.joint.probability * 100).toFixed(1)}% (legs are in different games and treated as independent).`
              : s.joint.state === "JOINT_PROBABILITY_UNAVAILABLE" ? "No combined chance is shown: two legs share a game, so their outcomes are linked and we have no validated way to combine them."
              : "No combined chance is shown: at least one leg's market has no qualified model probability."}
          </p>
          {s.warnings.includes("SAME_GAME_LEGS") ? <p className="sb-warn">Same-game legs: one game script can sink both.</p> : null}
          {s.warnings.includes("INCLUDES_4_OF_5") ? <p className="sb-warn">Includes a 4-of-5 leg because there were not enough 5-of-5 legs.</p> : null}
          {s.legs.map((l: any) => {
            const full = legs.find((x) => key(x) === `${l.playerId}|${l.family}|${l.side}`)!;
            return (
              <div className="sb-leg" key={`${l.playerId}|${l.family}|${l.side}`} data-leg={l.playerId}>
                <div><b>{l.name ?? l.playerId}</b> <small>{l.team}</small><br />{l.side} {l.line} {FAMILY[l.family] ?? l.family} <small>· {am(l.price)} · {legLine(l)}</small><br /><small>Last 5 vs this line: {l.tier} (history, not a probability){l.probability != null ? ` · model ${(l.probability * 100).toFixed(0)}%` : " · no qualified model probability"}</small></div>
                <button type="button" className="sb-x" onClick={() => setRemoved((r) => new Set(r).add(key(full)))} aria-label={`Remove ${l.name ?? l.playerId} and rebuild`}>Remove</button>
              </div>
            );
          })}
          <p className="sb-mute" data-book-availability-note>{BOOK_AVAILABILITY_NOTE}</p>
          <p className="sb-mute">Any single losing leg loses the whole {usd(stake)}. A player who does not play voids or loses the leg depending on the book&apos;s rules.</p>
        </div>
      ) : (
        <div className="sb-card" data-scenario-state="NO_QUALIFYING_BUILD">
          <b style={{ color: "var(--vault-text)" }}>No qualifying {cfg.title} build{asOf ? ` for this slate` : ""}.</b>
          <p className="sb-mute">We only use legs that went 5 of 5 (or 4 of 5, to fill) against a real, captured line, for a player confirmed to play, in a market qualified for products. Of {candidates.toLocaleString("en-US")} candidate legs, {legs.length} passed{removed.size ? ` (${removed.size} removed by you)` : ""}.</p>
          {Object.keys(refusedBy).length ? (
            <table aria-label="Why candidate legs were not used"><tbody>
              {Object.entries(refusedBy).sort((a, b) => b[1] - a[1]).map(([k, n]) => <tr key={k}><td>{n.toLocaleString("en-US")}</td><td>{REASON[k] ?? k}</td></tr>)}
            </tbody></table>
          ) : null}
          {removed.size ? <button type="button" className="sb-x" onClick={() => setRemoved(new Set())}>Restore removed legs</button> : null}
        </div>
      )}
    </section>
  );
}
