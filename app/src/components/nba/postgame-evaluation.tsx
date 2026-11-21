/**
 * NBA POSTGAME EVALUATION — presentational. Renders one `nba-postgame-evaluation@1` report
 * (built server-side by src/lib/sports/nba/postgame-evaluation.mjs) exactly as built: no I/O, no clock, no scoring of
 * its own. It imports only the dependency-free vocabulary module, so it is safe in a client bundle too.
 *
 * Not wired into any route. The /nba lane files belong to the release owner, who decides where (and whether) this
 * renders. Every number shown is the report's own; every absent number prints a dash, never a zero.
 *
 * Shows: the official result line per game (Elo winner side vs the actual winner, with the frozen pre-tip time), the
 * per-model Brier / log-loss table with its sample caveat, role labels (official / supporting / research only), player
 * families with their box-score-pending state, and what is withheld. No win probability is printed.
 *
 * Layout holds at 320px: no fixed widths; each table scrolls inside its own container.
 */
import React from "react";
// The vocabulary module imports nothing; the report builder itself is server/CLI-only (its graph reaches node:crypto).
import { GAME_STATE, PLAYER_STATE, PLAYER_FAMILIES, FAMILY_LABEL, ROLE, WORDING } from "@/lib/sports/nba/postgame-evaluation-vocab.mjs";

type Side = { abbr: string | null; name: string | null };
type ModelGame = { state: string; reason?: string; players?: { state: string; reason?: string } };
type Game = {
  providerEventId: string; matchup: string; home: Side; away: Side; tipUtc: string | null; actualStartUtc: string | null; frozenAt: string | null;
  official: { winnerSide: string | null; winnerTeam: string | null };
  actual: { winnerSide: string | null; winnerTeam: string | null; ftHome: number; ftAway: number } | null;
  officialResult: string | null; state: string; reason: string | null;
  models: Record<string, ModelGame>;
};
type Fam = { state: string; n: number | null; minN: number; mae: number | null; coverage80: number | null };
type Model = {
  id: string; label: string; role: string; roleLabel: string; officialFor: string | null; note: string; state: string;
  winner: { n: number | null; brier: number | null; logLoss: number | null };
  players: { state: string; pendingGames?: string[]; families?: Record<string, Fam> | null };
};
type Comparison = { model: string; state: string; text: string };
export type PostgameReport = {
  schema: string; date: string; generatedAt: string | null;
  games: Game[]; models: Model[]; comparisons: Comparison[];
  withheld: Record<string, string>;
  wording: { direction: string; playerDirection: string; noPromotion: string };
  promotion: { state: string; note: string };
  summary: { graded: number; officialSide: { matched: number; of: number }; sample: { n: number; minN: number; state: string; text: string } };
};

const et = (iso: string | null) =>
  iso && Number.isFinite(Date.parse(iso))
    ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + " ET"
    : null;
const fmt = (v: number | null | undefined) => (v == null ? "—" : String(v));
const teamName = (g: Game, abbr: string | null) => (abbr == null ? null : abbr === g.home.abbr ? g.home.name ?? abbr : abbr === g.away.abbr ? g.away.name ?? abbr : abbr);

const MUTE = { color: "var(--vault-text-mute)" } as const;
const TEXT = { color: "var(--vault-text)" } as const;
const TABLE = "w-full text-[12.5px] [&_th]:font-medium [&_th]:text-right [&_th:first-child]:text-left [&_td]:text-right [&_td]:tabular-nums [&_td:first-child]:text-left [&_td]:px-1 [&_th]:px-1 [&_td]:align-top";

const ROLE_STYLE: Record<string, React.CSSProperties> = {
  [ROLE.OFFICIAL]: { border: "1px solid var(--vault-gold-bright)", color: "var(--vault-gold-bright)" },
  [ROLE.SUPPORTING]: { border: "1px solid var(--vault-border)", color: "var(--vault-text)" },
  [ROLE.RESEARCH_ONLY]: { border: "1px dashed var(--vault-border)", color: "var(--vault-text-mute)" },
};

export function RoleBadge({ role, label }: { role: string; label: string }) {
  return (
    <span data-role={role} className="inline-block rounded px-1.5 text-[11.5px] whitespace-nowrap" style={ROLE_STYLE[role] ?? ROLE_STYLE[ROLE.RESEARCH_ONLY]}>
      {label}
    </span>
  );
}

const PLAYER_WORDS: Record<string, string> = {
  [PLAYER_STATE.GRADED]: "Graded",
  [PLAYER_STATE.PARTIAL]: "Partly graded — some box scores pending",
  [PLAYER_STATE.PENDING_BOXSCORE]: "Box score pending — not graded",
  [PLAYER_STATE.NO_GRADED_GAMES]: "No graded games",
  [PLAYER_STATE.NOT_APPLICABLE]: "Not applicable",
};

/** One game's official result line. */
export function OfficialResultLine({ game: g }: { game: Game }) {
  const frozen = et(g.frozenAt), tip = et(g.tipUtc);
  const side = teamName(g, g.official.winnerTeam);
  let result: React.ReactNode;
  if (g.state === GAME_STATE.GRADED && g.actual) {
    const won = teamName(g, g.actual.winnerTeam);
    result = <>Official side (Elo): <strong>{side ?? "none"}</strong> · actual winner: <strong>{won}</strong> ({g.away.abbr} {g.actual.ftAway}, {g.home.abbr} {g.actual.ftHome}) · {g.officialResult === "MATCHED" ? "matched" : g.officialResult === "MISSED" ? "missed" : "no side"}</>;
  } else if (g.state === GAME_STATE.HELD) {
    result = <>Held — not graded. {g.reason}</>;
  } else if (g.state === GAME_STATE.PENDING_FINAL) {
    result = <>Official side (Elo): <strong>{side ?? "none"}</strong> · final pending — not graded</>;
  } else {
    result = <>Not graded. {g.reason}</>;
  }
  return (
    <li data-state={g.state} className="flex flex-col gap-0.5 min-w-0">
      <span className="font-semibold break-words" style={TEXT}>{g.away.name ?? g.away.abbr} at {g.home.name ?? g.home.abbr}</span>
      <span className="text-[13px] break-words" style={TEXT}>{result}</span>
      <span className="text-[12px]" style={MUTE}>
        {frozen ? `Frozen ${frozen}` : "No frozen time"}{tip ? `, before the ${tip} tip-off` : ""}
      </span>
    </li>
  );
}

export function ModelTable({ report }: { report: PostgameReport }) {
  return (
    <div className="overflow-x-auto max-w-full" data-table="models">
      <table className={TABLE}>
        <caption className="text-left pb-1 text-[12.5px]" style={MUTE}>Winner probability scores · {report.wording.direction}</caption>
        <thead><tr><th scope="col">Model</th><th scope="col">Role</th><th scope="col">Games</th><th scope="col">Brier</th><th scope="col">Log loss</th></tr></thead>
        <tbody>
          {report.models.map((m) => (
            <tr key={m.id} data-model={m.id}>
              <td className="break-words">{m.label}{m.officialFor ? <span style={MUTE}> · official for {m.officialFor}</span> : null}</td>
              <td><RoleBadge role={m.role} label={m.roleLabel} /></td>
              <td>{fmt(m.winner.n)}</td>
              <td>{fmt(m.winner.brier)}</td>
              <td>{fmt(m.winner.logLoss)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PlayerFamilies({ model: m }: { model: Model }) {
  const words = PLAYER_WORDS[m.players.state] ?? m.players.state;
  return (
    <div className="flex flex-col gap-1 min-w-0" data-player-state={m.players.state} data-model={m.id}>
      <p className="m-0 text-[13px] flex flex-wrap gap-x-2 gap-y-1 items-center" style={TEXT}>
        <strong>{m.label}</strong> <RoleBadge role={m.role} label={m.roleLabel} /> <span style={MUTE}>{words}</span>
      </p>
      {m.players.pendingGames?.length ? (
        <p className="m-0 text-[12px] break-words" style={MUTE}>Box score pending for {m.players.pendingGames.length} game{m.players.pendingGames.length === 1 ? "" : "s"}: shown as a dash, never as zero.</p>
      ) : null}
      {m.players.families ? (
        <div className="overflow-x-auto max-w-full" data-table="players">
          <table className={TABLE}>
            <thead><tr><th scope="col">Family</th><th scope="col">Players</th><th scope="col">MAE</th><th scope="col">p10–p90 coverage</th></tr></thead>
            <tbody>
              {PLAYER_FAMILIES.map((f: string) => {
                const x = m.players.families?.[f];
                return (
                  <tr key={f} data-state={x?.state}>
                    <td>{FAMILY_LABEL[f as keyof typeof FAMILY_LABEL]}</td>
                    <td>{fmt(x?.n)}</td>
                    <td>{fmt(x?.mae)}</td>
                    <td>{fmt(x?.coverage80)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export default function NbaPostgameEvaluation({ report }: { report: PostgameReport | null }) {
  if (!report || !Array.isArray(report.games)) return null;
  const s = report.summary;
  const playerModels = report.models.filter((m) => m.players && m.players.state !== PLAYER_STATE.NOT_APPLICABLE);
  return (
    <section className="flex flex-col gap-3 min-w-0 max-w-full" aria-labelledby={`nba-postgame-${report.date}`} data-schema={report.schema}>
      <h2 id={`nba-postgame-${report.date}`} className="m-0 font-display text-[18px] font-bold" style={TEXT}>Forecast vs actual · {report.date}</h2>
      <div className="rounded-lg p-3" style={{ border: "1px solid var(--vault-border)", background: "var(--vault-panel)" }} role="note" data-sample-state={s.sample.state}>
        <p className="m-0 text-[13px]" style={TEXT}>
          Official winner side matched the actual winner in {s.officialSide.matched} of {s.officialSide.of} graded game{s.officialSide.of === 1 ? "" : "s"}.
        </p>
        <p className="m-0 mt-1 text-[12.5px]" style={MUTE}>{s.sample.text}</p>
      </div>
      <ul className="m-0 p-0 list-none flex flex-col gap-2">
        {report.games.map((g) => <OfficialResultLine key={g.providerEventId} game={g} />)}
      </ul>
      <ModelTable report={report} />
      <ul className="m-0 pl-5 text-[12px]" style={MUTE}>
        {report.comparisons.map((c) => <li key={c.model} data-state={c.state} className="break-words">{c.text}</li>)}
      </ul>
      {playerModels.length ? (
        <div className="flex flex-col gap-2 min-w-0">
          <h3 className="m-0 text-[15px] font-bold" style={TEXT}>Player figures</h3>
          <p className="m-0 text-[12px]" style={MUTE}>{report.wording.playerDirection}</p>
          {playerModels.map((m) => <PlayerFamilies key={m.id} model={m} />)}
        </div>
      ) : null}
      <ul className="m-0 pl-5 text-[12px]" style={MUTE}>
        <li>{WORDING.withheldLine}</li>
        <li>{report.wording.noPromotion}</li>
      </ul>
    </section>
  );
}
