/**
 * /nfl/world-model — NFL World Model V2 Top boards, EXPERIMENTAL (founder P0 · 2026-10-08). PUBLIC.
 *
 * The boards are computed from the same per-game artifacts the /nfl/world-model/[eventId] pages render
 * (lib/sports/nfl/world-model-v2/artifact.mjs topBoards), so a player's number here is his number on his game's page.
 * Games that have kicked off at build time and players who are not cleared (Questionable, Doubtful, Out) are left out;
 * a board shows fewer than ten rows rather than fill. No touchdown board: world touchdown probabilities are unsupported.
 */
import type { Metadata } from "next";
import path from "node:path";
import Link from "next/link";

import { readWorldModelArtifacts } from "@/lib/sports/nfl/world-model-v2/read.mjs";
import { BOARD_FAMILIES, STATUS, WORLD_MODEL_V2, topBoards } from "@/lib/sports/nfl/world-model-v2/artifact.mjs";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata: Metadata = withRouteMetadata("/nfl/world-model/", {
  title: "NFL World Model V2 — Top boards (experimental) · GameTime Picks",
  description: "Top 10 passing, rushing, receiving and receptions boards from World Model V2's simulated games, the same numbers as each game's World Model V2 page. Experimental; educational and paper-only.",
});

const CSS = `
.wm2b table{width:100%;border-collapse:collapse}
.wm2b th{text-align:left;padding:6px 8px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--vault-text-faint);white-space:nowrap}
.wm2b td{padding:6px 8px;border-top:1px solid var(--vault-border);font-size:12.5px}
.wm2b .k{font-family:var(--font-mono,ui-monospace,monospace);font-size:12px;white-space:nowrap}
.wm2b .f{color:var(--vault-text-faint);font-size:11px}
.wm2b .scroll{overflow-x:auto;margin-top:6px}
.wm2b .scroll:focus-visible{outline:2px solid var(--vault-gold);outline-offset:2px}
.wm2b section{margin-top:26px}
.wm2b h2{font-size:18px;margin:0;color:var(--vault-text)}
.wm2b p{font-size:13px;line-height:1.5;color:var(--vault-text-mute);margin:6px 0 0}
.wm2b .card{border:1px solid var(--vault-border-strong);border-top:2px solid var(--vault-warn);border-radius:12px;padding:12px 14px;margin-top:14px}
.wm2b ul{margin:6px 0 0;padding-left:18px;font-size:13px;line-height:1.7}
`;
const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

export default function NflWorldModelBoardsPage() {
  const artifacts: any[] = readWorldModelArtifacts(path.join(process.cwd(), "public"));
  const builtAt = new Date().toISOString();
  const { boards, games, excluded } = topBoards(artifacts, { now: builtAt });
  const upcoming = artifacts.filter((a) => Date.parse(a.identity.kickoffUtc) > Date.parse(builtAt));
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden wm2b">
      <style>{CSS}</style>
      <p className="font-mono" style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--vault-text-faint)", margin: 0 }}>
        <Link href="/nfl/">NFL</Link> · World Model V2
      </p>
      <h1 className="font-display" style={{ fontSize: 30, margin: "6px 0 0", color: "var(--vault-text)" }}>World Model V2 Top boards</h1>
      <div className="card">
        <p className="font-mono" style={{ margin: 0, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>Experimental · not the forecast of record</p>
        <p>
          Ranked by each player&apos;s average across his game&apos;s simulated games ({WORLD_MODEL_V2.version}), from {games} upcoming {games === 1 ? "game" : "games"}. The same numbers appear on each game&apos;s World Model V2 page. Players listed as Questionable, Doubtful or Out are left out, and a board shows fewer than ten players rather than fill. {STATUS.forwardEvaluated.value ? "" : "Not yet evaluated on games played after the model was frozen."} There is no touchdown board: touchdown probabilities from these simulated games are not supported.
        </p>
      </div>
      {BOARD_FAMILIES.map(({ key, title }) => (
        <section key={key} aria-labelledby={`wm2b-${key}`}>
          <h2 id={`wm2b-${key}`}>{title}</h2>
          {boards[key].length ? (
            <div className="scroll" role="region" aria-label={`${title} board`} tabIndex={0}>
              <table>
                <thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col">Game</th><th scope="col">Average</th><th scope="col">Median (80%)</th></tr></thead>
                <tbody>
                  {boards[key].map((r: any) => (
                    <tr key={r.playerId}>
                      <td className="k">{r.rank}</td>
                      <td>{r.name} <span className="f">{r.position ?? ""} · {r.team}</span></td>
                      <td><Link href={`/nfl/world-model/${r.providerEventId}/`}>{r.matchup}</Link></td>
                      <td className="k">{fmt(r.mean)}</td>
                      <td className="k">{fmt(r.median)} ({fmt(r.p10)}–{fmt(r.p90)})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p>No upcoming game has a World Model V2 simulation.</p>}
        </section>
      ))}
      <section aria-labelledby="wm2b-games">
        <h2 id="wm2b-games">Games</h2>
        <ul>
          {upcoming.map((a) => <li key={a.identity.providerEventId}><Link href={`/nfl/world-model/${a.identity.providerEventId}/`}>{a.identity.matchup}</Link> <span className="f">simulated {a.run.generatedAt.slice(0, 16).replace("T", " ")} UTC</span></li>)}
        </ul>
        {excluded.length ? <p className="f">Left out as not cleared: {excluded.map((x: any) => `${x.name} (${x.team}, ${x.availability.toLowerCase()})`).join(", ")}.</p> : null}
        <p className="f">Built {builtAt.slice(0, 16).replace("T", " ")} UTC. Educational and paper-only.</p>
      </section>
    </div>
  );
}
