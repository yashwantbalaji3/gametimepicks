/**
 * PredictionCard — the universal forecast card (P307). Renders a PredictionCardModel and nothing else: every string
 * arrives pre-built from the contract's adapters, so this file holds no evidence figure and no sport rule.
 *
 * compact: identity · forecast · signal · one risk. Used where copy is budgeted (the homepage Command Center).
 * full:    adds why, every risk and the status detail. For sport hubs and event pages.
 */
import Link from "next/link";
import TeamLogo from "@/components/team-logo";
import TeamMark from "@/components/ui/team-mark";
import type { CardSide, PredictionCardModel } from "@/lib/command-center/contract";
import { PUBLIC_STATE_LABEL } from "@/lib/command-center/contract";
import ModelStatusChip from "./model-status-chip";
import SaveForecastButton from "@/components/saved/save-forecast-button";
import { saveCardOf } from "@/lib/saved/saved-schema.mjs";

const LOGO_SPORT: Record<string, "mlb" | "nfl" | "soccer" | null> = { mlb: "mlb", nfl: "nfl", epl: "soccer", ufc: null };

function Side({ side, sport }: { side: CardSide; sport: PredictionCardModel["sport"] }) {
  const logoSport = LOGO_SPORT[sport];
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      {logoSport && side.code ? <TeamLogo team={side.code} sport={logoSport} size="sm" ariaLabel={`${side.name} logo`} /> : <TeamMark name={side.name} size="sm" />}
      <span className="truncate" style={{ color: side.favoured ? "var(--vault-text)" : "var(--vault-text-mute)", fontWeight: side.favoured ? 700 : 500, fontSize: 12.5 }}>{side.name}</span>
    </span>
  );
}

function signalLine(card: PredictionCardModel): string | null {
  const s = card.signal;
  if (s.kind === "SIM_STRENGTH") return `Simulation strength: ${s.label.toLowerCase()}`;
  if (s.kind === "PROBABILITY") return `${Math.round(s.probability * 100)}% chance · ${s.of}`;
  if (s.kind === "RANGE") return `${s.low}–${s.high} ${s.unit} · ${s.coverage}`;
  return null;
}

/** Each sport names a matchup its own way: "away @ home" on the diamond and the gridiron, "home v away" in football,
 *  "red vs blue" in the cage. The contract carries sides; the sport decides the order. */
const ORDER: Record<PredictionCardModel["sport"], { first: "away" | "home"; sep: string }> = { mlb: { first: "away", sep: "@" }, nfl: { first: "away", sep: "@" }, epl: { first: "home", sep: "v" }, ufc: { first: "away", sep: "vs" } };

export default function PredictionCard({ card, variant = "compact" }: { card: PredictionCardModel; variant?: "compact" | "full" }) {
  const signal = signalLine(card);
  const order = ORDER[card.sport];
  const first = order.first === "away" ? card.away : card.home;
  const second = order.first === "away" ? card.home : card.away;
  return (
    <article className="gtp-pcard flex flex-col gap-1.5 rounded-[12px] px-3 py-2.5" style={{ background: "color-mix(in srgb, var(--vault-wash-base) 3%, transparent)", border: "1px solid var(--vault-border)" }} aria-label={`${first.name} ${order.sep} ${second.name} forecast`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="inline-flex items-center gap-2 min-w-0">
          <Side side={first} sport={card.sport} />
          <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{order.sep}</span>
          <Side side={second} sport={card.sport} />
        </span>
        {card.startLabel ? <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{card.startLabel}</span> : null}
      </div>
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span>
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>{card.forecast.label} </span>
          <span className="font-display" style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 800, lineHeight: 1.1 }}>{card.forecast.value}</span>
        </span>
        <ModelStatusChip state={card.status.state} label={PUBLIC_STATE_LABEL[card.status.state]} title={card.status.detail} />
      </div>
      {card.forecast.sub ? <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>{card.forecast.sub}</span> : null}
      {signal ? <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{signal}</span> : null}
      {variant === "full" && card.why ? <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>{card.why}</p> : null}
      {(variant === "full" ? card.risks : card.risks.slice(0, 1)).map((r) => (
        <span key={r} className="font-mono" style={{ color: "var(--vault-warn)", fontSize: 10 }}>{r}</span>
      ))}
      {card.result ? (
        <span className="font-mono" style={{ color: card.result.outcome === "HIT" ? "var(--vault-success)" : card.result.outcome === "MISS" ? "var(--vault-danger)" : "var(--vault-text-faint)", fontSize: 10.5 }}>
          Final: {card.result.actual} · {card.result.outcome === "HIT" ? "the read landed" : card.result.outcome === "MISS" ? "the read missed" : "no result"}
        </span>
      ) : null}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {card.context ? <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{card.context}</span> : <span />}
        <span className="inline-flex items-center gap-2">
          {/* P310: saving keeps THIS card as it reads now; the saved page adds the result when it exists. */}
          <SaveForecastButton card={saveCardOf(card)} />
          <Link href={card.href} className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5, minHeight: 36, display: "inline-flex", alignItems: "center" }}>Open report →</Link>
        </span>
      </div>
    </article>
  );
}
