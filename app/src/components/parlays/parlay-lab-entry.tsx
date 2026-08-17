"use client";
import { useState } from "react";
import { useReaderPrefs, unitStake, type RiskTolerance } from "@/lib/prefs/reader-prefs";

/**
 * PARLAY LAB — the entry point. Two questions, then the tier that matches and what it has done.
 *
 * ── The number a tier is allowed to show ────────────────────────────────────────────────────────
 * A bettor tier is a POLICY (these price bands, this many cards a day), so its record is exactly
 * computable — replay the policy over every graded day. That is what makes a per-tier hit rate
 * honest: the number belongs to the set actually shown.
 *
 * But 1-2 cards a day over 48 graded days is 43-86 settled cards, and at that size a HIT RATE is
 * well determined (±3-8pp) while an ROI is not (±15-39pp). Three of the four tiers currently show a
 * positive ROI and not one clears two standard errors, while the full pool of cards in those same
 * bands is clearly negative. So the hit rate is stated as measured, and the ROI is shown only with
 * its uncertainty attached and never as a result.
 *
 * ── No default stake ────────────────────────────────────────────────────────────────────────────
 * The unit is arithmetic the reader can see. It is not written into the slip for them; a stake
 * chosen by the site and displayed as theirs is the thing this feature exists not to do.
 */

export interface BettorTier {
  readonly id: string;
  readonly label: string;
  readonly blurb: string;
  readonly bands: readonly string[];
  readonly cardsPerDay: number;
  readonly minBankroll: number;
  readonly settledCards: number;
  readonly wins: number;
  readonly losses: number;
  readonly hitRate: number | null;
  readonly hitRateSe: number | null;
  readonly roi: number | null;
  readonly roiSe: number | null;
  readonly roiDetermined: boolean;
  readonly roiT: number | null;
}

const RISK_TO_TIER: Record<RiskTolerance, string> = {
  low: "steady", medium: "balanced", high: "adventurous", longshot: "longshot",
};

const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const signed = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`);
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const RISKS: { key: RiskTolerance; label: string }[] = [
  { key: "low", label: "Steady" },
  { key: "medium", label: "Balanced" },
  { key: "high", label: "Adventurous" },
  { key: "longshot", label: "Longshot" },
];

export default function ParlayLabEntry({ tiers }: { tiers: readonly BettorTier[] }) {
  const { prefs, ready, update, clear } = useReaderPrefs();
  const [draft, setDraft] = useState("");
  const unit = unitStake(prefs);
  const matched = prefs.risk ? tiers.find((t) => t.id === RISK_TO_TIER[prefs.risk!]) ?? null : null;
  const answered = prefs.bankroll != null && prefs.risk != null;

  if (!ready) return null;

  return (
    <section aria-labelledby="lab-entry" className="flex flex-col gap-3 rounded-[16px] p-4"
      style={{ border: "1px solid var(--sport-theme-rule)", background: "linear-gradient(135deg, var(--sport-theme-wash) 0%, rgba(11,18,14,0.5) 62%)" }}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="lab-entry" className="font-display tracking-tight m-0" style={{ color: "var(--vault-text)", fontSize: 19, fontWeight: 800 }}>
          Parlay Lab
        </h2>
        <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
          Two questions · stays in your browser
        </span>
        {answered && (
          <button type="button" onClick={() => { clear(); setDraft(""); }} className="ml-auto font-mono uppercase tracking-[0.1em]"
            style={{ color: "var(--vault-text-faint)", fontSize: 9, background: "none", border: "none", cursor: "pointer" }}>
            Start over
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-5">
        <label className="flex flex-col gap-1">
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
            1 · Daily paper bankroll
          </span>
          <span className="inline-flex items-center rounded-[7px]" style={{ background: "rgba(0,0,0,0.32)", border: "1px solid var(--vault-rule)" }}>
            <span aria-hidden className="pl-2 font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>$</span>
            <input type="number" min={0} step={25} inputMode="decimal" placeholder="100"
              value={draft !== "" ? draft : (prefs.bankroll ?? "")}
              onChange={(e) => { setDraft(e.target.value); update({ bankroll: Number(e.target.value) || null }); }}
              className="font-mono tabular-nums bg-transparent"
              style={{ width: 92, padding: "6px 8px 6px 3px", color: "var(--vault-text)", fontSize: 13, border: "none", outline: "none" }} />
          </span>
        </label>

        <div className="flex flex-col gap-1">
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
            2 · Risk tolerance
          </span>
          <div className="flex flex-wrap gap-1.5">
            {RISKS.map((r) => {
              const on = prefs.risk === r.key;
              return (
                <button key={r.key} type="button" aria-pressed={on}
                  onClick={() => update({ risk: on ? null : r.key })}
                  className="gtp-slip-btn rounded-[7px] font-mono uppercase tracking-[0.1em]"
                  style={{
                    padding: "5px 10px", fontSize: 10, cursor: "pointer",
                    color: on ? "#06140D" : "var(--vault-text-mute)",
                    background: on ? "var(--gtp-bank-heat)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${on ? "transparent" : "var(--vault-rule)"}`,
                    fontWeight: on ? 700 : 500,
                  }}>
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {matched && (
        <div className="flex flex-col gap-2 rounded-[12px] px-3.5 py-3"
          style={{ background: "rgba(0,0,0,0.24)", border: "1px solid var(--vault-rule)" }}>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--sport-theme-ink)", fontSize: 9.5 }}>
              Your tier
            </span>
            <span className="font-display" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 800 }}>{matched.label}</span>
            <span style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>{matched.blurb}</span>
          </div>

          {/* The hit rate — measured, and stated with its uncertainty. */}
          <p className="m-0" style={{ color: "var(--vault-text)", fontSize: 13.5, lineHeight: 1.6 }}>
            This tier&rsquo;s cards landed{" "}
            <strong>{pct(matched.hitRate)}</strong> of the time
            {matched.hitRateSe != null ? ` (±${(matched.hitRateSe * 100).toFixed(1)})` : ""} —{" "}
            {matched.wins} of {matched.settledCards} settled cards over the graded run.
          </p>

          {/* The ROI — shown, but never as a result at this sample. */}
          <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.6 }}>
            Return over the same cards is {signed(matched.roi)}
            {matched.roiSe != null ? ` ± ${(matched.roiSe * 100).toFixed(1)}` : ""}.{" "}
            {matched.roiDetermined ? (
              "That clears two standard errors."
            ) : (
              <span style={{ color: "var(--vault-warn)" }}>
                At {matched.settledCards} cards that is <strong>not distinguishable from zero</strong>
                {matched.roiT != null ? ` (t = ${matched.roiT})` : ""} — the sample fixes the hit rate
                well and the return not at all. Every card in these price bands, taken together, is
                negative.
              </span>
            )}
          </p>

          {unit != null && (
            <p className="m-0" style={{ color: "var(--vault-text-faint)", fontSize: 11.5, lineHeight: 1.55 }}>
              {matched.cardsPerDay} card{matched.cardsPerDay === 1 ? "" : "s"} a day at {prefs.unitPct}% of{" "}
              {money(prefs.bankroll ?? 0)} is {money(unit)} a card. That is arithmetic on your two
              numbers — no stake is filled in for you anywhere on this site.
            </p>
          )}
        </div>
      )}

      {!answered && (
        <p className="m-0" style={{ color: "var(--vault-text-faint)", fontSize: 11.5, lineHeight: 1.55 }}>
          Answer both and the board below leads with the tier that matches, alongside what that tier
          has actually done. Nothing is sent anywhere, and nothing here is a recommendation to stake.
        </p>
      )}
    </section>
  );
}
