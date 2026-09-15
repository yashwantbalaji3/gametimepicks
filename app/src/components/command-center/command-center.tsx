/**
 * CommandCenter — Section 2 of `/` (P306): NFL, MLB, Premier League and UFC as lanes of ONE product. Each lane says
 * what is on (the product-day owner's line), how fresh the numbers are (the artifact's stamp), whether the model may
 * be trusted right now (two status chips from receipts and the health scorecard), and features the next forecast
 * through the universal card — or a designed reason why nothing is featured.
 *
 * Purely presentational: every string arrives from lib/command-center. It renders no figure it computed itself.
 */
import Link from "next/link";
import type { CommandCenterLane } from "@/lib/command-center/command-center";
import { PUBLIC_STATE_LABEL } from "@/lib/command-center/contract";
import ModelStatusChip from "./model-status-chip";
import PredictionCard from "./prediction-card";

const SPORT_ACCENT: Record<CommandCenterLane["sport"], string> = { nfl: "var(--sport-nfl)", mlb: "var(--sport-mlb)", epl: "var(--sport-soccer)", ufc: "var(--sport-ufc)" };
const STATE_TONE: Record<string, string> = { LIVE_TODAY: "var(--vault-success)", EVENT_THIS_WEEK: "var(--vault-info)", IN_SEASON_NO_SLATE: "var(--vault-text-mute)", HISTORICAL_ONLY: "var(--vault-text-faint)", NOT_SUPPORTED: "var(--vault-text-faint)" };
const FRESH_TONE: Record<string, string> = { FRESH: "var(--vault-text-faint)", DELAYED: "var(--vault-warn)", STALE: "var(--gtp-bank-heat)", MISSING: "var(--vault-text-faint)" };

function Lane({ lane }: { lane: CommandCenterLane }) {
  return (
    <div className="gtp-lane flex flex-col gap-2 rounded-[14px] px-4 py-3.5" style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", border: "1px solid var(--vault-border)", borderTop: `2px solid ${SPORT_ACCENT[lane.sport]}` }} data-sport={lane.sport}>
      <div className="flex items-center justify-between gap-2">
        <Link href={lane.hubHref} className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 800, textDecoration: "none" }}>{lane.label}</Link>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: STATE_TONE[lane.state] ?? "var(--vault-text-faint)", fontSize: 8.5 }}>{lane.stateLabel}</span>
      </div>
      <p className="m-0 text-[12px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>{lane.contextLine}</p>
      <span className="font-mono" style={{ color: FRESH_TONE[lane.freshness.state], fontSize: 9.5 }}>{lane.freshness.label}</span>
      <div className="flex flex-wrap gap-1">
        {lane.statuses.map((s) => <ModelStatusChip key={s.id} state={s.state} label={PUBLIC_STATE_LABEL[s.state]} family={s.family} title={`${s.headline}. ${s.detail}`} />)}
      </div>
      {lane.featured ? <PredictionCard card={lane.featured} variant="compact" /> : (
        <p className="m-0 rounded-[12px] px-3 py-2.5 text-[12px] leading-snug" style={{ color: "var(--vault-text-mute)", border: "1px dashed var(--vault-rule)" }}>{lane.emptyLine}</p>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1 flex-wrap">
        <Link href={lane.hubHref} className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5, minHeight: 24, display: "inline-flex", alignItems: "center" }}>Open {lane.label} hub →</Link>
        {lane.secondary ? <Link href={lane.secondary.href} className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{lane.secondary.label} · {lane.secondary.note} →</Link> : null}
        <Link href={lane.simulateHref} className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5, minHeight: 24, display: "inline-flex", alignItems: "center" }}>Simulate →</Link>
      </div>
    </div>
  );
}

export default function CommandCenter({ lanes, heading, subtitle }: { lanes: CommandCenterLane[]; heading: string; subtitle: string }) {
  return (
    <section aria-labelledby="command-center-h" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 id="command-center-h" className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold)", fontSize: 11 }}>{heading}</h2>
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{subtitle} · <Link href="/methodology/#model-status" style={{ color: "var(--vault-text-faint)" }}>what the statuses mean</Link></span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {lanes.map((lane) => <Lane key={lane.sport} lane={lane} />)}
      </div>
    </section>
  );
}
