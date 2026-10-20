"use client";
import { useCallback, useRef, type ReactNode } from "react";
import ParlayCard, { type V2CardView } from "./ParlayCard";
import SmartBetslip from "./SmartBetslip";
import { useSmartSlip, type SmartSlipApi } from "@/lib/slip/smart-slip-store";
import { etStamp } from "@/lib/et-stamp.mjs";

/**
 * PARLAY LAB V2 · THE FOUR-TIER BOARD (behind NEXT_PUBLIC_PARLAY_LAB_V2=1 on /build; default off).
 *
 * Always four sections — Low, Medium, High, Longshot — in that order. A tier with no card that clears every gate
 * says NO QUALIFYING PARLAY TODAY and lists why, in the adapter's own sentences (lib/parlays/v2/recommend.mjs). Each
 * tier carries its settled record with the denominator beside any rate, a small-sample note under 30 cards, and a
 * "ledger payout under review" note where the settlement defect touches it (lib/parlays/v2/history.mjs).
 *
 * Choosing a card opens the embedded compare slip prefilled with that card's recorded prices. The slip lives in this
 * browser only (gtp.slip.v2) and never touches the paper slip (gtp.slip.v1).
 */

export interface V2Reason { readonly code: string; readonly text: string; readonly count: number; readonly detail?: string | null }
export interface V2History {
  readonly since: string | null;
  readonly counts: { readonly win: number; readonly loss: number; readonly push: number; readonly void: number; readonly pending: number; readonly noPlay: number };
  readonly n: number;
  readonly hitRate: { readonly value: number; readonly wins: number; readonly of: number } | null;
  readonly smallSampleNote: string | null;
  readonly payoutNote: string | null;
}
export interface V2Tier {
  readonly tier: string;
  readonly label: string;
  readonly bandText: string;
  readonly status: "QUALIFIED" | "NO_QUALIFYING_PARLAY";
  readonly reasons: readonly V2Reason[];
  readonly cards: readonly V2CardView[];
  readonly history: V2History | null;
}
export interface ParlayLabV2Model {
  readonly slateDate: string;
  readonly evaluatedAt: string;
  readonly operatorSeam: { readonly state: string; readonly note: string | null };
  readonly availabilityNote: string;
  readonly tiers: readonly V2Tier[];
}

function HistoryLine({ h }: { h: V2History }) {
  const c = h.counts;
  return (
    <div className="flex flex-col gap-1" style={{ fontSize: 11, lineHeight: 1.5, color: "var(--vault-text-mute)" }}>
      <span className="font-mono tabular-nums">
        Settled cards{h.since ? ` since ${h.since}` : ""}: {h.n} · {c.win} won, {c.loss} lost, {c.push} pushed, {c.void} voided · {c.pending} pending · {c.noPlay} days with no card
      </span>
      {h.hitRate ? (
        <span className="font-mono tabular-nums">Won {h.hitRate.wins} of {h.hitRate.of} decided ({(h.hitRate.value * 100).toFixed(1)}%)</span>
      ) : null}
      {h.smallSampleNote ? <span style={{ color: "var(--vault-text-faint)" }}>{h.smallSampleNote}</span> : null}
      {h.payoutNote ? <span role="note" style={{ color: "var(--vault-warn)" }}>{h.payoutNote}</span> : null}
    </div>
  );
}

function TierSection({ t, selectedCardId, onCompare }: { t: V2Tier; selectedCardId: string | null; onCompare: (c: V2CardView) => void }) {
  const headingId = `v2-tier-${t.tier}-heading`;
  const qualified = t.status === "QUALIFIED";
  return (
    <section aria-labelledby={headingId} data-tier={t.tier} data-tier-status={t.status} className="flex flex-col gap-2.5 rounded-[14px] p-3.5"
      style={{ background: "color-mix(in srgb, var(--vault-wash-base) 1.5%, transparent)", border: qualified ? "1px solid var(--vault-border)" : "1px dashed var(--vault-rule)" }}>
      <div className="flex flex-col gap-0.5">
        <h3 id={headingId} className="m-0 font-display" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 800 }}>{t.label}</h3>
        <span className="font-mono tabular-nums" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>Combined price {t.bandText}</span>
      </div>
      {qualified ? (
        <div className="flex flex-col gap-2.5">
          {t.cards.map((c) => (
            <ParlayCard key={c.cardId} card={c} tierLabel={t.label} selected={selectedCardId === c.cardId} onCompare={onCompare} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="m-0 font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-warn)", fontSize: 10.5, fontWeight: 700 }}>
            No qualifying parlay today
          </p>
          <ul className="flex flex-col gap-1 m-0 pl-4" style={{ color: "var(--vault-text-mute)", fontSize: 12, lineHeight: 1.5 }} aria-label={`Why ${t.label} has no card today`}>
            {t.reasons.map((r) => (
              <li key={`${r.code}|${r.detail ?? ""}`}>
                {r.detail ?? r.text}
                {r.count > 0 ? <span style={{ color: "var(--vault-text-faint)" }}> ({r.count === 1 ? "1 card" : `${r.count} cards`})</span> : null}
                {r.detail ? <span className="sr-only"> — {r.text}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {t.history ? <HistoryLine h={t.history} /> : null}
    </section>
  );
}

/** /build: the board with the reader's own slip (browser storage, live clock). */
export default function TierBoard({ model }: { model: ParlayLabV2Model }) {
  const slipApi = useSmartSlip();
  return <TierBoardView model={model} slipApi={slipApi} />;
}

/**
 * The board over a slip the CALLER owns. /build passes the default hook above; the dev fixture route
 * (/dev/parlay-lab-fixture) passes a non-persisting, fixed-clock slip and an injected operator allowlist.
 */
export function TierBoardView({ model, slipApi, isVerifiedOperator, children }: {
  model: ParlayLabV2Model;
  slipApi: SmartSlipApi;
  isVerifiedOperator?: (label: unknown) => boolean;
  children?: ReactNode;
}) {
  const { slip, nowMs, openCard, remove, move, clear } = slipApi;
  const slipHeading = useRef<HTMLHeadingElement>(null);

  const onCompare = useCallback((card: V2CardView) => {
    openCard(card);
    slipHeading.current?.focus();
  }, [openCard]);

  return (
    <section aria-labelledby="v2-board-heading" className="flex flex-col gap-3" data-parlay-lab-v2="on">
      <div className="flex flex-col gap-1">
        <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>Preview</span>
        <h2 id="v2-board-heading" className="m-0 font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 800 }}>
          Four risk levels, checked today
        </h2>
        <p className="m-0 max-w-[70ch]" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.6 }}>
          Each published card is re-checked against every gate: games not started, prices fresh and from a verified sportsbook, legs from different games, and the combined price inside its band. A level with nothing that clears says so and why.
          {" "}Checked {etStamp(model.evaluatedAt) ?? model.evaluatedAt}.
        </p>
        {model.operatorSeam.note ? (
          <p className="m-0" role="note" style={{ color: "var(--vault-warn)", fontSize: 12 }}>{model.operatorSeam.note}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 items-start">
        {model.tiers.map((t) => <TierSection key={t.tier} t={t} selectedCardId={slip.sourceCardId} onCompare={onCompare} />)}
      </div>

      {children}

      <SmartBetslip ref={slipHeading} slip={slip} nowMs={nowMs} onRemove={remove} onMove={move} onClear={clear} isVerifiedOperator={isVerifiedOperator} />
    </section>
  );
}
