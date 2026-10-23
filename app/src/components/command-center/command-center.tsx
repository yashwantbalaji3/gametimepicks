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
import TeamLogo from "@/components/team-logo";

const SPORT_ACCENT: Record<CommandCenterLane["sport"], string> = { nfl: "var(--sport-nfl)", mlb: "var(--sport-mlb)", epl: "var(--sport-soccer)", ufc: "var(--sport-ufc)", nba: "var(--sport-nba)" };
const STATE_TONE: Record<string, string> = { LIVE_TODAY: "var(--vault-success)", EVENT_THIS_WEEK: "var(--vault-info)", IN_SEASON_NO_SLATE: "var(--vault-text-mute)", HISTORICAL_ONLY: "var(--vault-text-faint)", NOT_SUPPORTED: "var(--vault-text-faint)" };
const FRESH_TONE: Record<string, string> = { FRESH: "var(--vault-text-faint)", DELAYED: "var(--vault-warn)", STALE: "var(--gtp-bank-heat)", MISSING: "var(--vault-text-faint)" };

/* A lane that lists today's games (NBA): one row per matchup, the whole row ONE link (44px target) to the game's card on
   the hub; a row without an href is plain text. */
function LaneGames({ lane }: { lane: CommandCenterLane }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={`${lane.label} games today`}>
      {lane.games!.map((g) => {
        const body = (
          <>
            {g.crests.map((c, i) => (c ? <TeamLogo key={i} team={c} sport="nba" size="sm" ariaLabel="" /> : null))}
            <span className="font-semibold" style={{ color: "var(--vault-text)" }}>{g.label}</span>
            <span style={{ color: "var(--vault-text-mute)" }}>{g.time}</span>
            <span className="basis-full" style={{ color: "var(--vault-text-mute)" }}>{g.note}{g.href ? " →" : ""}</span>
          </>
        );
        return (
          <li key={g.id}>
            {g.href
              ? <Link href={g.href} className="nbx-lane-row no-underline">{body}</Link>
              : <div className="nbx-lane-row">{body}</div>}
          </li>
        );
      })}
      {lane.moreGames ? <li className="text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>+{lane.moreGames} more on the {lane.label} hub</li> : null}
    </ul>
  );
}

function Lane({ lane }: { lane: CommandCenterLane }) {
  return (
    <div className="gtp-lane flex flex-col gap-2 rounded-[14px] px-4 py-3.5" style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", border: "1px solid var(--vault-border)", borderTop: `2px solid ${SPORT_ACCENT[lane.sport]}` }} data-sport={lane.sport}>
      <div className="flex items-center justify-between gap-2">
        <Link href={lane.hubHref} className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 800, textDecoration: "none", minHeight: 44, display: "inline-flex", alignItems: "center" }}>{lane.label}</Link>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: STATE_TONE[lane.state] ?? "var(--vault-text-faint)", fontSize: 8.5 }}>{lane.stateLabel}</span>
      </div>
      <p className="m-0 text-[12px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>{lane.contextLine}</p>
      <span className="font-mono" style={{ color: FRESH_TONE[lane.freshness.state], fontSize: 9.5 }}>{lane.freshness.label}</span>
      <div className="flex flex-wrap gap-1">
        {lane.statuses.map((s) => <ModelStatusChip key={s.id} state={s.state} label={PUBLIC_STATE_LABEL[s.state]} family={s.family} title={`${s.headline}. ${s.detail}`} />)}
      </div>
      {lane.games?.length ? <LaneGames lane={lane} /> : lane.featured ? <PredictionCard card={lane.featured} variant="compact" /> : (
        <p className="m-0 rounded-[12px] px-3 py-2.5 text-[12px] leading-snug" style={{ color: "var(--vault-text-mute)", border: "1px dashed var(--vault-rule)" }}>{lane.emptyLine}</p>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1 flex-wrap">
        <Link href={lane.hubHref} className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5, minHeight: 44, display: "inline-flex", alignItems: "center" }}>Open {lane.label} hub →</Link>
        {/* A games lane (NBA) gives its secondary link a 44px target (release owner 2026-10-22: Top Boards measured 15px at
            390px); the other lanes' links are unchanged. */}
        {lane.secondary ? <Link href={lane.secondary.href} className="font-mono gtp-hit-44" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{lane.secondary.label} · {lane.secondary.note} →</Link> : null}
        {lane.simulateHref ? <Link href={lane.simulateHref} className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5, minHeight: 44, display: "inline-flex", alignItems: "center" }}>Simulate →</Link> : null}
      </div>
    </div>
  );
}

/** `id` names this instance: the homepage renders two (Simulation Hub + Other coverage). A shared heading id made each
 *  aria-labelledby and in-page anchor resolve to the first by document order (unique-dom-ids.test, found 2026-10-22 on a
 *  rehearsal build where a lane sat in Other coverage; Production then had no secondary lane, so it was latent). */
export default function CommandCenter({ lanes, heading, subtitle, id = "command-center" }: { lanes: CommandCenterLane[]; heading: string; subtitle: string; id?: string }) {
  return (
    <section aria-labelledby={`${id}-h`} data-command-center={id} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 id={`${id}-h`} className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold)", fontSize: 11 }}>{heading}</h2>
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{subtitle} · <Link href="/methodology/#model-status" style={{ color: "var(--vault-text-faint)", minHeight: 44, display: "inline-flex", alignItems: "center" }}>what the statuses mean</Link></span>
      </div>
      {/* Literal class strings (Tailwind JIT): five lanes take five columns at xl, never a 4 + 1 orphan row. */}
      <div className={`grid gap-3 sm:grid-cols-2 ${lanes.length === 5 ? "lg:grid-cols-3 xl:grid-cols-5" : "xl:grid-cols-4"}`}>
        {lanes.map((lane) => <Lane key={lane.sport} lane={lane} />)}
      </div>
    </section>
  );
}
