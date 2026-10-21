/**
 * NBA EXPERIMENTAL PUBLIC LANE — the /nba section (founder decision 2026-10-20 · preregistration §12 look 5 · §13).
 *
 * Renders ONLY the canonical snapshot (public/data/nba/experimental-public/latest.json, built from receipt-verified
 * pre-tip forecasts by scripts/nba/build-nba-experimental-public.mjs). Every block names its source; the Elo side and
 * the v0.1 player medians are shown as the two separate components they are. No probability, no percentage, no team
 * score, no range, no odds, no ranking and no pick vocabulary reaches the page (lane tests pin each).
 *
 * Time words are absolute: a frozen pregame forecast reads the same before tip, during the game and after it — the
 * page never calls it live.
 */
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { LANE, STATS, LANE_SNAPSHOT_SCHEMA, laneIsCurrent } from "@/lib/sports/nba/experimental-public-lane.mjs";

type Row = { providerAthleteId: string; name: string | null; expectedMinutes: number | null; injuryStatus: string | null; medians: Record<string, number | null> };
type Game = {
  providerEventId: string; tipUtc: string; frozenAt: string;
  away: { abbr: string | null; name: string | null }; home: { abbr: string | null; name: string | null };
  receipt: { modelVersion: string; payloadSha256: string };
  engine: { simulation: string | null; simulations: number | null };
  elo: { favoured: string | null; state: string; source: string };
  teamScores: { state: string; reason: string };
  players: { source: string; away: Row[]; home: Row[] };
};
type Snapshot = { schema: string; label: string; validation: string; date: string | null; withheld: Record<string, string>; games: Game[]; excluded: { providerEventId: string; reason: string }[] };

/** The lane to show at `etDate`: null when disabled, missing, or its slate is in the past (never shown as current). */
export function loadCurrentLane(etDate: string): Snapshot | null {
  const s = loadExperimentalSnapshot();
  return s && laneIsCurrent(s, etDate) ? s : null;
}

export function loadExperimentalSnapshot(): Snapshot | null {
  if (!LANE.enabled) return null;
  try {
    const s = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "nba", "experimental-public", "latest.json"), "utf8"));
    return s?.schema === LANE_SNAPSHOT_SCHEMA && Array.isArray(s.games) ? s : null;
  } catch {
    return null;
  }
}

const et = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + " ET";
const slateLabel = (d: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${d}T12:00:00Z`));
const fmt = (v: number | null) => (v == null ? "—" : String(v));

/* One class string per table (descendant variants) instead of per-cell attributes: the rows are inlined twice (HTML +
   RSC payload), so per-cell classes cost ~2× their length per cell on a page that sits at its weight budget. */
const TABLE = "w-full text-[12.5px] [&_th]:font-medium [&_th]:text-right [&_th:first-child]:text-left [&_td]:text-right [&_td]:tabular-nums [&_td:first-child]:text-left [&_td]:px-1 [&_th]:px-1";

function TeamTable({ team, rows }: { team: string; rows: Row[] }) {
  return (
    <div className="overflow-x-auto">
      <table className={TABLE}>
        <caption className="text-left font-semibold pb-1">{team}</caption>
        <thead><tr><th>Player</th><th>Min</th>{STATS.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.providerAthleteId}>
              <td>{r.name}{r.injuryStatus ? ` · ${r.injuryStatus}` : ""}</td>
              <td>{fmt(r.expectedMinutes)}</td>
              {STATS.map(([k]) => <td key={k}>{fmt(r.medians[k])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const favouredName = (g: Game) => (g.elo.favoured === g.home.abbr ? g.home.name : g.elo.favoured === g.away.abbr ? g.away.name : null) ?? g.elo.favoured;
export const laneCardId = (id: string) => `nba-exp-${id}`;

/** One line above the schedule: which games have frozen experimental output, each a jump link to its card. */
export function NbaLaneTonight({ snapshot }: { snapshot: Snapshot | null }) {
  if (!snapshot || snapshot.games.length === 0) return null;
  const frozen = [...new Set(snapshot.games.map((g) => et(g.frozenAt)))].join(" / ");
  return (
    <p className="m-0 text-[13.5px]" style={{ color: "var(--vault-text)" }}>
      <strong>{LANE.label}:</strong>{" "}
      {snapshot.games.map((g, i) => (
        <span key={g.providerEventId}>{i ? " · " : ""}<a href={`#${laneCardId(g.providerEventId)}`} className="underline">{g.away.name} at {g.home.name}</a></span>
      ))}
      <span style={{ color: "var(--vault-text-mute)" }}> — frozen pregame model output (frozen {frozen}), not validated.</span>
    </p>
  );
}

export default function NbaExperimentalLane({ snapshot, statuses = {} }: { snapshot: Snapshot | null; statuses?: Record<string, string> }) {
  if (!snapshot || snapshot.games.length === 0) return null;
  return (
    <section id="nba-experimental" className="scroll-mt-24 flex flex-col gap-3" aria-labelledby="nba-experimental-h">
      <div className="rounded-lg p-3" style={{ border: "2px solid var(--vault-gold-bright)", background: "var(--vault-panel)" }} role="note">
        <p className="m-0 font-display text-[13px] font-extrabold tracking-wide" style={{ color: "var(--vault-gold-bright)" }}>{LANE.label}</p>
        <p className="m-0 mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
          Frozen pregame model output, published as experimental analytics — not validated, not a betting recommendation and
          not a pick. These models have not yet met their preregistered regular-season checks, and nothing here counts toward
          them. Each figure was frozen before tip-off and is shown exactly as frozen.
        </p>
      </div>
      <h2 id="nba-experimental-h" className="m-0 font-display text-[18px] font-bold" style={{ color: "var(--vault-text)" }}>Experimental model projections{snapshot.date ? ` · ${slateLabel(snapshot.date)} slate` : ""}</h2>
      {snapshot.games.map((g) => (
        <article key={g.providerEventId} id={laneCardId(g.providerEventId)} className="scroll-mt-24 flex flex-col gap-2 rounded-lg p-3" style={{ border: "1px solid var(--vault-border)" }} aria-label={`${g.away.abbr} at ${g.home.abbr}, frozen pregame forecast`}>
          <header className="flex flex-col gap-0.5">
            <h3 className="m-0 text-[15px] font-bold" style={{ color: "var(--vault-text)" }}>{g.away.name} at {g.home.name}</h3>
            <p className="m-0 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
              Tip-off {et(g.tipUtc)} · frozen pregame forecast, frozen {et(g.frozenAt)}
            </p>
            {statuses[g.providerEventId] ? <p className="m-0 text-[12px]" style={{ color: "var(--vault-text)" }}>Game status: {statuses[g.providerEventId]}</p> : null}
          </header>
          <p className="m-0 text-[13px]" style={{ color: "var(--vault-text)" }}>
            <strong>Elo rating favours {favouredName(g) ?? "neither side"}.</strong>{" "}
            <span style={{ color: "var(--vault-text-mute)" }}>Source: {g.elo.source}.</span>
          </p>
          <p className="m-0 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>Team scores: {g.teamScores.reason}</p>
          <p className="m-0 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
            Player medians — source: {g.players.source}. Players listed by expected minutes, not ranked.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <TeamTable team={g.away.name ?? g.away.abbr ?? "Away"} rows={g.players.away} />
            <TeamTable team={g.home.name ?? g.home.abbr ?? "Home"} rows={g.players.home} />
          </div>
          <p className="m-0 text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>
            Receipt {g.receipt.modelVersion} · {g.receipt.payloadSha256.slice(0, 12)} · simulation engine {g.engine.simulation}
          </p>
        </article>
      ))}
      <ul className="m-0 pl-5 text-[12px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
        {Object.entries(snapshot.withheld).map(([k, v]) => <li key={k}>{v}</li>)}
      </ul>
    </section>
  );
}
