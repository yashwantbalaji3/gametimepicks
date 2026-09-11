"use client";
import type { BuildLeg } from "@/lib/build-legs";
import { cardChance, bandRecord, linkedPairs, shorterAlternative, impliedFromAmerican } from "@/lib/parlays/lab/slip-insight.mjs";
import ChanceMeter from "./chance-meter";

/**
 * SLIP GAUGES (P261) — what the card being built actually is, updated as legs go on and come off.
 *
 * Three readings, each from something already published:
 *   · the chance the combined price implies, beside the settled record of the lab's own cards in the
 *     same price band (not this card's record — nobody has graded a card that does not exist);
 *   · which legs are linked, named pair by pair with the compatibility engine's own reason;
 *   · one shorter-priced stand-in for the longest leg, offered as a trade — smaller payout, higher
 *     implied chance — never as an improvement, and never applied without a tap.
 *
 * No model probability: every modeled MLB prop market is demoted to market context, so the only
 * chance stated here is the price's own, labelled as including the sportsbook's margin.
 */

interface Candidate {
  readonly player: string;
  readonly market: string;
  readonly gameId: string;
  readonly americanOdds: number;
  readonly marketLabel: string;
  readonly side: string;
  readonly line: number | null;
  readonly photoUrl: string | null;
  readonly teamAbbr: string | null;
  readonly opponentAbbr: string | null;
  readonly matchup: string;
  readonly leg: BuildLeg;
}

interface Alternative {
  readonly outgoing: Candidate;
  readonly incoming: Candidate;
  readonly beforeAmerican: number;
  readonly afterAmerican: number;
  readonly beforeChance: number | null;
  readonly afterChance: number | null;
}

const american = (n: number) => `${n > 0 ? "+" : ""}${n}`;
const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`);
/**
 * A trade must never READ as no change. Rounding to whole percent turned a real move into
 * "13% → 13%" while the payout visibly dropped, which understates exactly what the reader is giving
 * up. When the rounded pair collides, both sides gain a decimal.
 */
const pctPair = (before: number | null, after: number | null): [string, string] => {
  if (before == null || after == null) return [pct(before), pct(after)];
  const same = pct(before) === pct(after);
  const fmt = (v: number) => `${(v * 100).toFixed(same ? 1 : v < 0.1 ? 1 : 0)}%`;
  return [fmt(before), fmt(after)];
};

const toCandidate = (l: BuildLeg): Candidate => ({
  player: l.slipLeg?.player ?? l.label,
  market: l.market,
  gameId: String(l.gameId ?? ""),
  americanOdds: l.americanOdds,
  marketLabel: l.marketLabel,
  side: l.slipLeg?.side ?? "",
  line: l.slipLeg?.line ?? null,
  photoUrl: l.photo ?? null,
  teamAbbr: l.slipLeg?.teamAbbr ?? null,
  opponentAbbr: null,
  matchup: "",
  leg: l,
});

export default function SlipGauges({
  draft, pool, byTier, onSwap,
}: {
  draft: readonly { readonly key: string; readonly engineLeg: BuildLeg }[];
  pool: readonly BuildLeg[];
  /** The risk-ladder record by price band — the published comparison for a built card's price. */
  byTier: Readonly<Record<string, { wins: number; losses: number; roi?: number | null }>> | null;
  onSwap: (outgoingKey: string, incoming: BuildLeg) => void;
}) {
  const priced = draft.filter((d) => Number.isFinite(d.engineLeg.americanOdds) && d.engineLeg.americanOdds !== 0);
  if (priced.length < 1) return null;

  const engineLegs = priced.map((d) => d.engineLeg);
  const chance = cardChance(engineLegs) as ReturnType<typeof cardChance> & { decimal: number; american: number; impliedChance: number | null; weakestLegChance: number | null };
  if (!chance) return null;
  const record = bandRecord(chance.american, byTier) as { band: string; wins: number; losses: number; decided: number; hitRate: number } | null;
  const links = linkedPairs(engineLegs) as { a: BuildLeg; b: BuildLeg; hardDisable: boolean; reason: string }[];

  const candidates = pool.filter((l) => l.slipLeg && Number.isFinite(l.americanOdds)).map(toCandidate);
  const alt = (priced.length >= 2 ? shorterAlternative(candidates, priced.map((d) => toCandidate(d.engineLeg))) : null) as Alternative | null;
  const outgoingKey = alt ? priced.find((d) => d.engineLeg.americanOdds === alt.outgoing.americanOdds && (d.engineLeg.slipLeg?.player ?? d.engineLeg.label) === alt.outgoing.player)?.key ?? null : null;

  const weakest = chance.weakestLegChance;
  const weakestLeg = weakest == null ? null : engineLegs.find((l) => impliedFromAmerican(l.americanOdds) === weakest) ?? null;

  return (
    <div className="flex flex-col gap-3 pt-2" style={{ borderTop: "1px solid var(--vault-rule)" }}>
      <ChanceMeter
        decimal={chance.decimal}
        record={record ? { wins: record.wins, losses: record.losses } : null}
        since={null}
      />

      {record ? (
        <p className="m-0" style={{ color: "var(--vault-text-faint)", fontSize: 10.5, lineHeight: 1.5 }}>
          The record is the lab&rsquo;s own published cards in the {record.band} price band — not this card, which
          has never been graded.
        </p>
      ) : null}

      {weakestLeg && priced.length > 1 ? (
        <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 11.5, lineHeight: 1.5 }}>
          Least likely leg: <strong style={{ color: "var(--vault-text)" }}>{weakestLeg.slipLeg?.player ?? weakestLeg.label}</strong>{" "}
          at {american(weakestLeg.americanOdds)} — the price implies {pct(weakest)}.
        </p>
      ) : null}

      {links.length > 0 ? (
        <ul className="flex flex-col gap-1.5 list-none m-0 p-0">
          {links.slice(0, 4).map((p, i) => (
            <li
              key={`${p.a.id}:${p.b.id}:${i}`}
              className="rounded-[8px] px-2.5 py-1.5"
              style={{
                background: p.hardDisable ? "var(--vault-danger-dim)" : "var(--vault-warn-dim)",
                border: `1px solid ${p.hardDisable ? "var(--vault-danger)" : "var(--vault-warn)"}`,
              }}
            >
              <span className="block font-semibold" style={{ color: "var(--vault-text)", fontSize: 11.5 }}>
                {(p.a.slipLeg?.player ?? p.a.label)} + {(p.b.slipLeg?.player ?? p.b.label)}
              </span>
              <span className="block" style={{ color: "var(--vault-text-mute)", fontSize: 11, lineHeight: 1.45 }}>{p.reason}</span>
            </li>
          ))}
        </ul>
      ) : priced.length > 1 ? (
        <p className="m-0" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>
          No two legs here share a game — nothing on this card is linked by a rule the engine can prove.
        </p>
      ) : null}

      {alt && outgoingKey ? (
        <div className="flex flex-col gap-2 rounded-[10px] px-3 py-2.5" style={{ background: "var(--vault-wash-faint)", border: "1px dashed var(--vault-rule)" }}>
          <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
            A shorter-priced stand-in
          </span>
          <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 11.5, lineHeight: 1.55 }}>
            Swap <strong style={{ color: "var(--vault-text)" }}>{alt.outgoing.player}</strong> ({american(alt.outgoing.americanOdds)}) for{" "}
            <strong style={{ color: "var(--vault-text)" }}>{alt.incoming.player}</strong> ({american(alt.incoming.americanOdds)}) and the card moves{" "}
            {american(alt.beforeAmerican)} → {american(alt.afterAmerican)}: a smaller payout at a higher implied chance
            ({pctPair(alt.beforeChance, alt.afterChance)[0]} → {pctPair(alt.beforeChance, alt.afterChance)[1]}). A trade, not an improvement.
          </p>
          <button
            type="button"
            onClick={() => onSwap(outgoingKey, alt.incoming.leg)}
            className="vault-press self-start rounded-full px-3.5"
            style={{ minHeight: 40, border: "1px solid var(--vault-border-strong)", color: "var(--vault-text)", fontSize: 12, fontWeight: 700, background: "transparent" }}
          >
            Make the swap
          </button>
        </div>
      ) : null}
    </div>
  );
}
