"use client";
import Link from "next/link";
import PlayerAvatar from "@/components/ui/player-avatar";
import { mlbHeadshotUrl } from "@/lib/player-headshots";
import { useReaderPrefs, type RiskTolerance } from "@/lib/prefs/reader-prefs";
import { pickForYou, RISK_ORDER } from "@/lib/parlays/lab/style-replay.mjs";
import type { LadderCard } from "@/components/parlays/risk-ladder-board";
import ChanceMeter from "./chance-meter";
import StyleReplayChart, { type ReplayItem } from "./style-replay-chart";

/**
 * FOR YOU (P260 · Parlay Lab 2.0) — the day's card at the risk level the reader chose, with the three
 * things that decide whether it fits them: the chance its price implies, what that level has actually
 * done, and a replay of that level on their own bankroll.
 *
 * It MATCHES a stated preference; it does not advise. The reader picks the level (here or in the panel
 * above — both write the same browser-only preference), the card is the one the ladder already
 * published for that level, and switching levels is one tap. Nothing here is a recommendation to stake.
 */
export interface TierReplayView {
  readonly since: string | null;
  readonly through: string | null;
  readonly tiers: Readonly<Record<string, readonly ReplayItem[]>>;
}

const LABEL: Record<string, string> = { low: "Low risk", medium: "Medium risk", high: "High risk", longshot: "Longshot" };
const american = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n}`);
const toDecimal = (am: number) => (am > 0 ? 1 + am / 100 : 1 + 100 / Math.abs(am));
const money = (v: number) => `$${v.toFixed(2)}`;

interface Pick {
  readonly main: LadderCard;
  readonly substitute: boolean;
  readonly safer: LadderCard | null;
  readonly bolder: LadderCard | null;
}

export default function ForYouSpotlight({
  cards, replay, recordSince, slateDate,
}: {
  cards: readonly LadderCard[];
  replay: TierReplayView | null;
  recordSince: string | null;
  slateDate: string | null;
}) {
  const { prefs, ready, update, unit } = useReaderPrefs();
  if (cards.length === 0) return null;
  const byTier = new Map(cards.map((c) => [c.tier, c]));
  const pick = (ready ? pickForYou([...cards], prefs.risk) : null) as Pick | null;
  const choose = (t: string) => update({ risk: t as RiskTolerance });

  return (
    <section
      aria-labelledby="for-you-heading"
      className="flex flex-col gap-4 rounded-[18px] p-4 sm:p-5"
      style={{
        background: "color-mix(in srgb, var(--vault-gold-bright) 5%, var(--vault-panel))",
        border: "1px solid var(--vault-border-strong)",
      }}
    >
      <div className="flex flex-col gap-1">
        <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5 }}>
          Parlay Center · matched to you{slateDate ? ` · ${slateDate}` : ""}
        </span>
        <h2 id="for-you-heading" className="font-display tracking-tight m-0" style={{ color: "var(--vault-text)", fontSize: 22, fontWeight: 800 }}>
          Pick a risk level. See how it lands.
        </h2>
      </div>

      <div role="group" aria-label="Risk level" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {RISK_ORDER.map((t: string) => {
          const c = byTier.get(t);
          const on = ready && prefs.risk === t;
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => choose(t)}
              className="vault-press flex flex-col items-start gap-0.5 rounded-[12px] px-3 py-2 text-left"
              style={{
                minHeight: 56,
                border: `1px solid ${on ? "var(--vault-gold-bright)" : "var(--vault-border)"}`,
                background: on ? "var(--vault-gold-dim)" : "transparent",
                color: "var(--vault-text)",
              }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{LABEL[t]}</span>
              <span className="font-mono tabular-nums" style={{ fontSize: 11.5, color: c ? "var(--vault-text-mute)" : "var(--vault-text-faint)" }}>
                {c ? `${american(c.combinedAmerican)} · ${c.legs.length} legs` : "none today"}
              </span>
            </button>
          );
        })}
      </div>

      {!pick ? (
        <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 13, lineHeight: 1.6 }}>
          Choose a level to see today&rsquo;s card at that level, the chance its price implies beside what that level
          has actually done, and a replay of that level on your bankroll.
        </p>
      ) : (
        <SpotlightBody
          key={pick.main.slipId}
          pick={pick}
          stated={prefs.risk}
          unit={unit}
          bankroll={prefs.bankroll}
          unitPct={prefs.unitPct}
          replay={replay}
          recordSince={recordSince}
          slateDate={slateDate}
          onChoose={choose}
        />
      )}

      <p className="m-0 font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9, lineHeight: 1.6 }}>
        Your choices stay in this browser · paper only · nothing here is a recommendation to stake
      </p>
    </section>
  );
}

function SpotlightBody({
  pick, stated, unit, bankroll, unitPct, replay, recordSince, slateDate, onChoose,
}: {
  pick: Pick;
  stated: string | null;
  unit: number | null;
  bankroll: number | null;
  unitPct: number;
  replay: TierReplayView | null;
  recordSince: string | null;
  slateDate: string | null;
  onChoose: (t: string) => void;
}) {
  const { main, substitute, safer, bolder } = pick;
  const dec = toDecimal(main.combinedAmerican);
  /* With no bankroll stated, the card and the replay share one illustrative basis — the reader's unit
     percentage of $100 — so the two never quote different stakes side by side. */
  const stake = unit ?? Math.round(100 * unitPct) / 100;

  return (
    <div className="gtp-rise grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-4 items-start">
      <article
        className="flex flex-col gap-3 rounded-[14px] p-4"
        style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", border: "1px solid var(--vault-border)" }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>
            {LABEL[main.tier]} card
          </span>
          <span className="font-display tabular-nums" style={{ color: "var(--vault-text)", fontSize: 32, fontWeight: 800, lineHeight: 1 }}>
            {american(main.combinedAmerican)}
          </span>
        </div>
        {substitute && stated ? (
          <p className="m-0 rounded-[8px] px-2.5 py-1.5" style={{ color: "var(--vault-text-mute)", fontSize: 12, background: "var(--vault-warn-dim)", border: "1px solid var(--vault-warn)" }}>
            No {LABEL[stated]?.toLowerCase()} card on this slate — the nearest level with one is shown instead.
          </p>
        ) : null}

        <ul className="flex flex-col gap-2.5 list-none m-0 p-0">
          {main.legs.map((l, i) => (
            <li key={`${l.player}:${i}`} className="gtp-rise flex items-center gap-2.5 min-w-0" style={{ ["--i" as string]: i + 1 }}>
              <PlayerAvatar name={l.player} photo={l.playerId ? mlbHeadshotUrl(l.playerId) : null} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold leading-tight" style={{ color: "var(--vault-text)", fontSize: 13.5 }}>{l.player}</span>
                <span className="block truncate" style={{ color: "var(--vault-text-faint)", fontSize: 11.5 }}>
                  {l.side} {l.line} {l.marketLabel}{l.opponent ? ` · vs ${l.opponent}` : ""}
                </span>
              </span>
              <span className="shrink-0 font-mono tabular-nums" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>{american(l.odds)}</span>
            </li>
          ))}
        </ul>

        <p className="m-0 font-mono tabular-nums" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>
          {unit != null ? `One unit (${money(stake)})` : `At ${unitPct}% of a $100 bankroll, a ${money(stake)} card`} returns {money(stake * dec)} if all {main.legs.length} legs land.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/build/custom?card=${encodeURIComponent(main.slipId)}`}
            className="vault-press inline-flex items-center justify-center rounded-full px-4 no-underline"
            style={{ minHeight: 44, background: "var(--gtp-bank-lava-cta)", color: "var(--vault-ink-on-mint)", fontSize: 13, fontWeight: 800 }}
          >
            Customize this card →
          </Link>
          {safer ? (
            <button type="button" onClick={() => onChoose(safer.tier)} className="vault-press rounded-full px-3.5"
              style={{ minHeight: 44, border: "1px solid var(--vault-border)", color: "var(--vault-text-mute)", fontSize: 12.5, fontWeight: 600 }}>
              ← Lower risk {american(safer.combinedAmerican)}
            </button>
          ) : null}
          {bolder ? (
            <button type="button" onClick={() => onChoose(bolder.tier)} className="vault-press rounded-full px-3.5"
              style={{ minHeight: 44, border: "1px solid var(--vault-border)", color: "var(--vault-text-mute)", fontSize: 12.5, fontWeight: 600 }}>
              Higher risk {american(bolder.combinedAmerican)} →
            </button>
          ) : null}
        </div>
      </article>

      <div
        className="flex flex-col gap-5 rounded-[14px] p-4"
        style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 40%, transparent)", border: "1px solid var(--vault-border)" }}
      >
        <ChanceMeter decimal={dec} record={main.tierRecord} since={recordSince} />
        <StyleReplayChart
          series={replay?.tiers[main.tier] ?? []}
          bankroll={bankroll}
          unitPct={unitPct}
          since={replay?.since ?? null}
          tierLabel={LABEL[main.tier]}
        />
      </div>
    </div>
  );
}
