"use client";
import { useEffect, useRef, useState } from "react";
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
  readonly worstLosingRun: number;
  readonly medianDaysToWin: number | null;
}

const RISK_TO_TIER: Record<RiskTolerance, string> = {
  low: "steady", medium: "balanced", high: "adventurous", longshot: "longshot",
};

const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const signed = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`);
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/*
 * The risk levels are named for the RISK, not for the bettor.
 *
 * They read "Steady / Balanced / Adventurous / Longshot", which describes a temperament and quietly
 * flatters the choice — "Adventurous" sounds like a personality, "High" sounds like what it is. The
 * bands themselves are unchanged; only the labels stop editorialising.
 */
const RISKS: { key: RiskTolerance; label: string }[] = [
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
  { key: "longshot", label: "Longshot" },
];

export interface LabLedgerView {
  readonly policy: { readonly version: number; readonly since: string; readonly summary: string };
  readonly streams: readonly { readonly id: string; readonly label: string; readonly live: boolean; readonly blocked?: string;
    readonly settledDays: number;
    readonly record: { readonly wins: number; readonly losses: number; readonly hitRate: number | null; readonly roi: number | null } }[];
  readonly priorPolicy: { readonly label: string; readonly summary: string; readonly gradedDays: number;
    readonly wins: number; readonly losses: number; readonly roi: number | null; readonly note: string };
}

export default function ParlayLabEntry({ tiers, ledger, showTitle = true }: {
  tiers: readonly BettorTier[];
  ledger?: LabLedgerView | null;
  /* False where the PAGE is already titled "Parlay Lab" (i.e. /build). Repeating it gave that page
     two identical headings and no way to tell which one you had reached. */
  showTitle?: boolean;
}) {
  const { prefs, ready, update, clear } = useReaderPrefs();
  const [draft, setDraft] = useState("");
  const unit = unitStake(prefs);
  const matched = prefs.risk ? tiers.find((t) => t.id === RISK_TO_TIER[prefs.risk!]) ?? null : null;
  const live = ledger?.streams.find((s) => s.id === "mlb") ?? null;
  const answered = prefs.bankroll != null && prefs.risk != null;

  /*
   * The door opens ONCE per visit, and only for a reader who has not already been inside. Someone
   * returning with a tier saved is not arriving at the Lab for the first time, and replaying the
   * flourish on every page load would turn a piece of theatre into a toll.
   *
   * Mounted state, not a CSS-only reveal, because it must be REMOVED after it plays — a persistent
   * overlay above an interactive panel is a hit-testing hazard waiting to happen, even with
   * pointer-events off.
   */
  const [doorOpen, setDoorOpen] = useState(false);
  const doorRan = useRef(false);
  useEffect(() => {
    if (doorRan.current || !ready) return;
    doorRan.current = true;
    if (answered) return;                                   // already been inside
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setDoorOpen(true);
    const t = window.setTimeout(() => setDoorOpen(false), 1400);
    return () => window.clearTimeout(t);
  }, [ready, answered]);

  if (!ready) return null;

  return (
    <section aria-labelledby="lab-entry" className="relative flex flex-col gap-3 rounded-[16px] p-4"
      style={{ border: "1px solid var(--sport-theme-rule)", background: "linear-gradient(135deg, var(--sport-theme-wash) 0%, color-mix(in srgb, var(--vault-scrim-base) 50%, transparent) 62%)" }}>
      {/* Scenery. The panel below is in the DOM and readable from the first frame; these leaves sit
          on top and retract, so a reader who never sees the animation loses nothing. */}
      {doorOpen && (
        <span className="gtp-vault" aria-hidden>
          <span className="gtp-vault-leaf gtp-vault-leaf--l" />
          <span className="gtp-vault-leaf gtp-vault-leaf--r" />
          <span className="gtp-vault-seam" />
          <span className="gtp-vault-wheel" />
        </span>
      )}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {showTitle ? (
          <h2 id="lab-entry" className="font-display tracking-tight m-0" style={{ color: "var(--vault-text)", fontSize: 19, fontWeight: 800 }}>
            Parlay Lab
          </h2>
        ) : (
          <span id="lab-entry" className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 800 }}>
            Start here
          </span>
        )}
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
          <span className="inline-flex items-center rounded-[7px]" style={{ background: "color-mix(in srgb, var(--vault-ink-black) 32%, transparent)", border: "1px solid var(--vault-rule)" }}>
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
              const tier = tiers.find((t) => t.id === RISK_TO_TIER[r.key]);
              /* Gated tiers stay SELECTABLE and stay visible. The gate is a nudge with a reason
                 attached, not a locked door — a tier you cannot reach becomes a tier you want. */
              const gated = tier != null && prefs.bankroll != null && prefs.bankroll < tier.minBankroll;
              return (
                <button key={r.key} type="button" aria-pressed={on}
                  onClick={() => update({ risk: on ? null : r.key })}
                  title={gated ? `Suggested from ${money(tier!.minBankroll)} a day — ${tier!.worstLosingRun} straight losers in the graded run` : tier?.blurb}
                  className="gtp-slip-btn rounded-[7px] font-mono uppercase tracking-[0.1em]"
                  style={{
                    padding: "5px 10px", fontSize: 10, cursor: "pointer",
                    color: on ? "var(--vault-ink-on-mint)" : gated ? "var(--vault-text-faint)" : "var(--vault-text-mute)",
                    background: on ? "var(--gtp-bank-heat)" : "color-mix(in srgb, var(--vault-wash-base) 3%, transparent)",
                    border: `1px solid ${on ? "transparent" : gated ? "var(--vault-rule)" : "var(--vault-rule)"}`,
                    fontWeight: on ? 700 : 500,
                    opacity: gated && !on ? 0.62 : 1,
                  }}>
                  {r.label}{gated ? " ·" : ""}{gated ? <span aria-hidden> ⚠</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {matched && (
        <div className="flex flex-col gap-2 rounded-[12px] px-3.5 py-3"
          style={{ background: "color-mix(in srgb, var(--vault-ink-black) 24%, transparent)", border: "1px solid var(--vault-rule)" }}>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--sport-theme-ink)", fontSize: 9.5 }}>
              Your tier
            </span>
            <span className="font-display" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 800 }}>{matched.label}</span>
            <span style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>{matched.blurb}</span>
          </div>

          {/*
           * THE LIVE RECORD COMES FIRST, even when it is empty.
           *
           * The selection policy changed on 2026-08-17, so the ladder restarted at 0-0: the 48 days
           * behind it measure a different product (six cards a tier, legs reused across tiers, up to
           * six legs). Carrying that forward as this policy's record would misattribute it.
           *
           * The prior result is NOT deleted — it sits below, labelled. A −9.4% that vanishes on the
           * day the policy changes is the oldest trick there is, and a reader meeting an empty
           * ledger deserves to know what the previous version of this did.
           */}
          {live && (
            <p className="m-0" style={{ color: "var(--vault-text)", fontSize: 13.5, lineHeight: 1.6 }}>
              {live.record.wins + live.record.losses === 0 ? (
                <>
                  This tier has <strong>no settled cards yet</strong>. The Lab restarted on{" "}
                  {ledger?.policy.since} when its selection rules changed, and the record below
                  begins from zero.
                </>
              ) : (
                <>
                  Since the restart this stream is{" "}
                  <strong>{live.record.wins}&ndash;{live.record.losses}</strong>
                  {live.record.hitRate != null ? ` (${pct(live.record.hitRate)})` : ""} across{" "}
                  {live.settledDays} settled day{live.settledDays === 1 ? "" : "s"}.
                </>
              )}
            </p>
          )}

          {prefs.bankroll != null && prefs.bankroll < matched.minBankroll && (
            <div className="rounded-[10px] px-3 py-2.5"
              style={{ background: "color-mix(in srgb, var(--vault-warn) 10%, transparent)", border: "1px solid var(--vault-warn)" }}>
              <p className="m-0" style={{ color: "var(--vault-text)", fontSize: 12.5, lineHeight: 1.6 }}>
                We suggest this tier from <strong>{money(matched.minBankroll)}</strong> a day, and you
                entered {money(prefs.bankroll)}. It went <strong>{matched.worstLosingRun} cards</strong>{" "}
                without a win in the graded run
                {matched.medianDaysToWin != null ? `, and typically waits about ${matched.medianDaysToWin} days between wins` : ""}.
              </p>
              <p className="m-0 mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 11, lineHeight: 1.55 }}>
                That threshold is our judgement about who should start here, not something the maths
                produced — at a flat stake a dry spell costs the same fraction of any bankroll. It is
                still selected; nothing is locked.
              </p>
            </div>
          )}

          {ledger?.priorPolicy && ledger.priorPolicy.gradedDays > 0 && (
            <div className="rounded-[10px] px-3 py-2"
              style={{ background: "var(--vault-wash-faint)", border: "1px dashed var(--vault-rule)" }}>
              <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 11.5, lineHeight: 1.6 }}>
                <strong style={{ color: "var(--vault-text)" }}>{ledger.priorPolicy.label}:</strong>{" "}
                {ledger.priorPolicy.wins}&ndash;{ledger.priorPolicy.losses} over{" "}
                {ledger.priorPolicy.gradedDays} graded days, ROI{" "}
                <span style={{ color: (ledger.priorPolicy.roi ?? 0) < 0 ? "var(--vault-danger)" : "var(--vault-success)" }}>
                  {signed(ledger.priorPolicy.roi)}
                </span>. {ledger.priorPolicy.summary}. {ledger.priorPolicy.note}
              </p>
            </div>
          )}

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
