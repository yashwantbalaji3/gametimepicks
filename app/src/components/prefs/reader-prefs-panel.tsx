"use client";
import { useState } from "react";
import {
  useReaderPrefs, unitStake, bankrollOutcome,
  UNIT_PCT_MIN, UNIT_PCT_MAX, type RiskTolerance,
} from "@/lib/prefs/reader-prefs";

/**
 * "TAILOR THIS PAGE" — the reader states a bankroll and a risk tolerance, and the page responds.
 *
 * What it does: filters the ladder to the tier they chose, and sizes every stake as a flat
 * percentage of the number they typed.
 *
 * What it will not do: tell them to stake anything. The panel's most prominent output is what the
 * chosen tier's SETTLED record would have done to their stated bankroll — and every tier published
 * here is negative, so for every reader who fills this in, the honest answer is a loss. That is the
 * point of showing it. A personalisation feature on a losing stream that made the stream feel more
 * appealing would be the single most misleading thing on the site.
 */

const TIERS: { key: RiskTolerance; label: string; band: string }[] = [
  { key: "low", label: "Low", band: "−200 to +100" },
  { key: "medium", label: "Medium", band: "+100 to +300" },
  { key: "high", label: "High", band: "+300 to +600" },
  { key: "longshot", label: "Longshot", band: "> +600" },
];

const money = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ReaderPrefsPanel({
  tierRecords,
}: {
  /** tier → settled record, so the consequence shown is the measured one. */
  tierRecords: Record<string, { wins: number; losses: number; roi: number | null }>;
}) {
  const { prefs, ready, update, clear } = useReaderPrefs();
  const [draft, setDraft] = useState<string>("");
  const unit = unitStake(prefs);
  const rec = prefs.risk ? tierRecords[prefs.risk] : null;
  const cards = rec ? rec.wins + rec.losses : 0;
  const outcome = rec ? bankrollOutcome(prefs, rec.roi, cards) : null;

  if (!ready) return null;

  return (
    <section aria-labelledby="prefs-heading" className="flex flex-col gap-3 rounded-[14px] p-3.5"
      style={{ background: "rgba(11,18,14,0.5)", border: "1px solid var(--vault-border)" }}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 id="prefs-heading" className="font-display tracking-tight m-0" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 800 }}>
          Tailor this page
        </h3>
        <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
          Stays in your browser · never sent anywhere
        </span>
        {(prefs.bankroll != null || prefs.risk != null) && (
          <button type="button" onClick={() => { clear(); setDraft(""); }}
            className="ml-auto font-mono uppercase tracking-[0.1em]"
            style={{ color: "var(--vault-text-faint)", fontSize: 9, background: "none", border: "none", cursor: "pointer" }}>
            Reset
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
            Paper bankroll
          </span>
          <span className="inline-flex items-center rounded-[7px]"
            style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--vault-rule)" }}>
            <span aria-hidden className="pl-2 font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>$</span>
            <input
              type="number" min={0} step={50} inputMode="decimal" placeholder="500"
              value={draft !== "" ? draft : (prefs.bankroll ?? "")}
              onChange={(e) => { setDraft(e.target.value); update({ bankroll: Number(e.target.value) || null }); }}
              className="font-mono tabular-nums bg-transparent"
              style={{ width: 88, padding: "5px 7px 5px 3px", color: "var(--vault-text)", fontSize: 12.5, border: "none", outline: "none" }}
            />
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
            Per card · {prefs.unitPct}%
          </span>
          <input
            type="range" min={UNIT_PCT_MIN} max={UNIT_PCT_MAX} step={1}
            value={prefs.unitPct}
            onChange={(e) => update({ unitPct: Number(e.target.value) })}
            style={{ width: 120, accentColor: "var(--gtp-bank-heat)" }}
            aria-label={`Percent of bankroll per card: ${prefs.unitPct}%`}
          />
        </label>

        <div className="flex flex-col gap-1">
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
            Risk tolerance
          </span>
          <div className="flex flex-wrap gap-1.5">
            {TIERS.map((t) => {
              const on = prefs.risk === t.key;
              return (
                <button key={t.key} type="button" aria-pressed={on}
                  onClick={() => update({ risk: on ? null : t.key })}
                  title={t.band}
                  className="gtp-slip-btn rounded-[6px] font-mono uppercase tracking-[0.1em]"
                  style={{
                    padding: "4px 8px", fontSize: 9.5, cursor: "pointer",
                    color: on ? "#06140D" : "var(--vault-text-mute)",
                    background: on ? "var(--gtp-bank-heat)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${on ? "transparent" : "var(--vault-rule)"}`,
                    fontWeight: on ? 700 : 500,
                  }}>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {unit != null && (
        <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.6 }}>
          One unit is <strong style={{ color: "var(--vault-text)" }}>{money(unit)}</strong> — {prefs.unitPct}% of{" "}
          {money(prefs.bankroll ?? 0)}. Flat on every card; there is no progression here and no
          stake sizing that assumes an edge.
        </p>
      )}

      {/*
       * THE CONSEQUENCE. The most prominent thing a reader gets for filling this in is what the
       * tier they picked has actually done — applied to their own number, as a completed past.
       */}
      {outcome != null && rec && (
        <div className="rounded-[10px] px-3 py-2.5"
          style={{
            background: (rec.roi ?? 0) < 0 ? "color-mix(in srgb, var(--vault-danger) 9%, transparent)" : "rgba(255,255,255,0.02)",
            border: `1px solid ${(rec.roi ?? 0) < 0 ? "var(--vault-danger)" : "var(--vault-rule)"}`,
          }}>
          <p className="m-0" style={{ color: "var(--vault-text)", fontSize: 13, lineHeight: 1.6 }}>
            At {money(unit ?? 0)} a card, this tier&rsquo;s settled record would have turned{" "}
            {money(prefs.bankroll ?? 0)} into{" "}
            <strong style={{ color: (rec.roi ?? 0) < 0 ? "var(--vault-danger)" : "var(--vault-success)" }}>
              {money((prefs.bankroll ?? 0) + outcome)}
            </strong>{" "}
            across {cards} settled cards — a {outcome < 0 ? "loss" : "gain"} of {money(outcome)}.
          </p>
          <p className="m-0 mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 11.5, lineHeight: 1.55 }}>
            That is what already happened, not a forecast. It is the reason this is shown: the tier
            is published with its record, and the record is the answer.
          </p>
        </div>
      )}

      <p className="m-0" style={{ color: "var(--vault-text-faint)", fontSize: 10.5, lineHeight: 1.55 }}>
        These numbers filter and size what is already published. Nothing here is a recommendation to
        stake, and nothing on this site is placed with real money.
      </p>
    </section>
  );
}
