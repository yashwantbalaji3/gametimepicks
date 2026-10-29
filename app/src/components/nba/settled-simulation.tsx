/**
 * /nba/simulation/<id> after its slate — THE SETTLED PAGE (overnight W7 2026-10-28; audit A #17 / reassessment #22:
 * shared Game Simulation links died the next day). SERVER component; no client island, no simulation.
 *
 * What happened, in reading order: the matchup and date, the official final with the official record's verdict, the
 * frozen Official Forecast exactly as the dated lane file holds it (favoured side, the Elo-derived estimate behind its
 * own switch, every published player's medians, the players without a projection by reason), the simulation-archived
 * note, links to that day's board and NBA results, and one collapsed "Technical details" (model ids, receipt, rule).
 * Data: settled-simulation-data.ts. Rule and copy shared with the 404 tombstone: expired-simulation.mjs.
 * A missing number prints "—", never 0; team scores stay withheld as the lane says.
 */
import Link from "next/link";

import MoreDisclosure from "@/components/ui/more-disclosure";
import { EloAccuracyDisclosure, EloWinProbability } from "@/components/nba/elo-win-probability";
import { OFFICIAL_MODEL_PLAIN, OFFICIAL_PREDICTIONS_TITLE, unavailableReasonText } from "@/components/nba/official-predictions";
import { NBA_RESULTS_LINK, SIMULATION_ARCHIVED_NOTE, settledVerdictText } from "@/components/nba/expired-simulation.mjs";
import type { SettledView } from "@/components/nba/settled-simulation-data";
import { COMBO_STATS, STATS } from "@/lib/sports/nba/experimental-public-lane.mjs";
import { ELO_WIN_PROBABILITY_LABEL, eloWinProbabilityOf } from "@/lib/sports/nba/elo-win-probability.mjs";
import { loadEloWinProbabilityContext } from "@/lib/sports/nba/elo-win-probability-context.mjs";
import { NBA_FORECAST_DISCLOSURE, PUBLIC_TERMS } from "@/lib/public-registry";
import NbaPropLines from "@/components/nba/nba-prop-lines";

/** The page's own marker: the flag-ON export scan tells a settled page from a Game Simulation page by it. */
export const SETTLED_SIMULATION_ATTR = "data-nba-settled-simulation";
export const SETTLED_ARCHIVED_HEADING = "Game Simulation archived";

const dayLabel = (d: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${d}T12:00:00Z`));
const et = (iso: string | null | undefined) => {
  const t = Date.parse(String(iso ?? ""));
  return Number.isFinite(t) ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(t)) + " ET" : "—";
};
const fmt = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(1) : "—");

type Row = SettledView["game"]["players"]["away"][number];

export default function SettledSimulation({ view }: { view: SettledView }) {
  const { game: g, record, date } = view;
  const away = g.away.abbr ?? "—";
  const home = g.home.abbr ?? "—";
  const fav = g.elo.state === "FAVOURED" ? (g.elo.favoured === g.home.abbr ? g.home : g.elo.favoured === g.away.abbr ? g.away : null) : null;
  const elo = loadEloWinProbabilityContext();
  const eloShown = eloWinProbabilityOf(g, { enabled: elo.enabled }) != null;
  const final = record?.final ?? null;
  const attrs = { [SETTLED_SIMULATION_ATTR]: view.id };
  return (
    <article className="flex flex-col gap-4" {...attrs}>
      <nav aria-label="This game" className="nbx-gamenav">
        <Link href="/nba/" className="gtp-backlink">← NBA hub</Link>
        <Link href={`/nba/projections/${date}/`} prefetch={false}>Top Boards · {dayLabel(date)}</Link>
        <Link href={NBA_RESULTS_LINK} prefetch={false}>Results</Link>
      </nav>

      <header className="flex flex-col gap-1">
        <p className="nbx-kind">NBA · {dayLabel(date)} · tip-off {et(g.tipUtc)}</p>
        <h1 className="m-0 font-display text-[24px] font-extrabold" style={{ color: "var(--vault-text)" }}>
          {g.away.name ?? away} at {g.home.name ?? home}
        </h1>
        <p className="m-0 text-[16px] font-semibold" style={{ color: "var(--vault-text)" }} data-settled-final={final ? `${final.away}-${final.home}` : "none"}>
          {final ? <>Final{record?.state === "HELD" ? " (under review)" : ""}: {away} {final.away} – {final.home} {home}</> : "No official final recorded yet."}
        </p>
        <p className="m-0 text-[14px]" style={{ color: "var(--vault-text-mute)" }} data-settled-verdict={record?.state ?? "NONE"}>
          {settledVerdictText(record?.state ?? "", fav?.name ?? fav?.abbr ?? null)}
        </p>
      </header>

      <section className="nbx-official" aria-labelledby="settled-official-h">
        <p className="nbx-kind">{PUBLIC_TERMS.OFFICIAL_FORECAST} · frozen before tip-off · shown exactly as frozen</p>
        <h2 id="settled-official-h">{OFFICIAL_PREDICTIONS_TITLE}</h2>
        <dl className="nbx-kv">
          <dt>Favoured side</dt><dd><strong>{fav ? `${fav.name ?? fav.abbr} (${fav.abbr})` : "Neither side"}</strong> · {OFFICIAL_MODEL_PLAIN.game}</dd>
          {eloShown ? <><dt>{ELO_WIN_PROBABILITY_LABEL}</dt><dd><EloWinProbability game={g} ctx={elo} /></dd></> : null}
          <dt>Player statistics</dt><dd>{OFFICIAL_MODEL_PLAIN.players} · medians</dd>
          <dt>Frozen</dt><dd>{et(g.frozenAt)}</dd>
          <dt>Withheld</dt><dd>{eloShown ? "Team scores" : "Win chance, team scores"}, player ranges, prices</dd>
        </dl>
        <PlayerTable team={g.away.name ?? away} rows={g.players.away} none={g.players.unavailable?.away ?? []} />
        <PlayerTable team={g.home.name ?? home} rows={g.players.home} none={g.players.unavailable?.home ?? []} />
        <p className="nbx-fine">
          Medians from the frozen player simulation; MIN is expected minutes. PRA, P+R and P+A are medians of the per-draw sums over the same
          simulated draws, so they are not the sum of the medians beside them. &ldquo;—&rdquo; means the figure was not published. A status after a
          name is the pre-tip injury report.
        </p>
        <EloAccuracyDisclosure games={[g]} ctx={elo} className="nbx-fine" />
        <p className="nbx-fine">{NBA_FORECAST_DISCLOSURE}</p>
      </section>

      <section aria-labelledby="settled-archived-h" className="flex flex-col gap-2">
        <h2 id="settled-archived-h" className="m-0 font-display text-[16px] font-bold" style={{ color: "var(--vault-text)" }}>{SETTLED_ARCHIVED_HEADING}</h2>
        <p className="m-0 text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
          {SIMULATION_ARCHIVED_NOTE} No {PUBLIC_TERMS.GAME_SIMULATION} is shown on this page.
        </p>
        <p className="m-0 flex flex-wrap gap-2">
          <Link href={`/nba/projections/${date}/`} prefetch={false} className="gtp-hit-44 nbx-pill no-underline">{PUBLIC_TERMS.OFFICIAL_FORECAST}s · {dayLabel(date)} →</Link>
          <Link href={NBA_RESULTS_LINK} prefetch={false} className="gtp-hit-44 nbx-pill no-underline">NBA results →</Link>
        </p>
      </section>

      {/* Model vs. sportsbook line, frozen as of tip (founder P0 2026-10-29): nothing while NBA_LINE_DISPLAY.public is false. */}
      <NbaPropLines lane={{ date: view.date, games: [g] }} eventId={view.id} id="nba-settled-prop-lines" />

      <MoreDisclosure title="Technical details" summary="Model versions, the frozen receipt and the rule behind the favoured side">
        <dl className="nbx-kv">
          <dt>Favoured side</dt><dd>{g.elo.source}{g.elo.rule ? ` · rule ${g.elo.rule}` : ""}</dd>
          <dt>Player model</dt><dd>{g.players.source}</dd>
          <dt>Model version</dt><dd>{g.receipt.modelVersion}</dd>
          <dt>Receipt</dt><dd>payload hash {g.receipt.payloadSha256}</dd>
          <dt>Simulation engine</dt><dd>{g.engine.simulation ?? "—"}{g.engine.simulations ? ` · ${g.engine.simulations.toLocaleString("en-US")} simulated games` : ""}</dd>
        </dl>
      </MoreDisclosure>
    </article>
  );
}

function PlayerTable({ team, rows, none }: { team: string; rows: readonly Row[]; none: ReadonlyArray<{ providerAthleteId: string; name: string | null; reason: string; status?: string | null }> }) {
  const shown = new Set(rows.map((r) => String(r.providerAthleteId)));
  const missing = none.filter((u) => !shown.has(String(u.providerAthleteId)));
  return (
    <div className="nbx-scroll" role="region" aria-label={`${team} · ${PUBLIC_TERMS.PLAYER_STATISTICS}`} tabIndex={0}>
      <table className="nbx-ptable">
        <caption>{team} · {PUBLIC_TERMS.PLAYER_STATISTICS}</caption>
        <thead><tr><th scope="col">Player</th><th scope="col">MIN</th>{STATS.map(([, l]) => <th key={l} scope="col">{l}</th>)}{COMBO_STATS.map(([, l]) => <th key={l} scope="col">{l}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.providerAthleteId}>
              <th scope="row">{r.name ?? r.providerAthleteId}{r.injuryStatus ? <span data-injury-status=""> · {r.injuryStatus}</span> : null}</th>
              <td>{fmt(r.expectedMinutes)}</td>
              {STATS.map(([k]) => <td key={k}>{fmt(r.medians[k])}</td>)}
              {COMBO_STATS.map(([k]) => <td key={k}>{fmt(r.comboMedians?.[k])}</td>)}
            </tr>
          ))}
          {missing.map((u) => (
            <tr key={`u-${u.providerAthleteId}`} data-nba-projection-unavailable={u.providerAthleteId}>
              <th scope="row">{u.name ?? u.providerAthleteId}</th>
              <td colSpan={1 + STATS.length + COMBO_STATS.length} style={{ textAlign: "left" }}>Projection unavailable — {unavailableReasonText(u.reason, u.status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
