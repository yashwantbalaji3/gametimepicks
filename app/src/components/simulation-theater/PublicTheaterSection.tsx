/**
 * Simulation Theater V2 · the PUBLIC section on /nfl/simulation/[eventId] (P242 narrow exception, founder 2026-10-19:
 * "Public beta if gates pass"; docs/launch/approvals/P242_NFL_THEATER_PUBLIC_BETA_2026-10-19.md).
 *
 * Server component. The page imports it ONLY inside `if (process.env.GTP_NFL_THEATER_PUBLIC === "1")` (a build-time
 * constant, next.config.mjs), so with the flag OFF this module, the theater CSS and the island are not in the build.
 *
 * What it adds around the prototype's TheaterSection (reused unchanged, devHooks off):
 *   - the four persistent labels and the methodology note, OUTSIDE the client island, so they stay on screen and in the
 *     accessibility tree before, during and after playback, and with JavaScript off;
 *   - a server-rendered drive table of the recorded sample (the no-JavaScript fallback);
 *   - a truthful "Simulation replay unavailable" state for a receipt that does not adapt or has no valid run (no pack
 *     is serialized then).
 */
import "./public-theater.css";
import type { CSSProperties } from "react";

import TheaterSection from "./TheaterSection";
import { Unavailable } from "./parts";
import { THEATER_VARS } from "./theater-css";
import type { TheaterLoad, TheaterManifest, TheaterSample } from "./types";
import {
  PUBLIC_THEATER_LABELS, PUBLIC_THEATER_LABEL_LINE, PUBLIC_THEATER_METHODOLOGY, UNAVAILABLE_TITLE, defaultSample, driveTableRows, publicTheaterLoad,
} from "@/lib/simulation-theater/public-theater.mjs";

type Rec = Parameters<typeof publicTheaterLoad>[0];
type DriveRow = { n: number; start: string; offense: string; from: string; plays: string; yards: string; time: string; result: string; score: string };

function Labels() {
  return (
    <ul className="stp-labels" aria-label={`Simulation replay disclosure: ${PUBLIC_THEATER_LABEL_LINE}`} data-stp-labels="">
      {PUBLIC_THEATER_LABELS.map((l) => <li key={l}>{l}</li>)}
    </ul>
  );
}

function Methodology() {
  return (
    <div className="stp-method" role="note" aria-label="How this replay is made" data-stp-method="">
      {PUBLIC_THEATER_METHODOLOGY.map((m) => <p key={m.term}><b>{m.term}:</b> {m.text}</p>)}
    </div>
  );
}

function DriveTable({ manifest, sample }: { manifest: TheaterManifest; sample: TheaterSample }) {
  const rows: DriveRow[] = driveTableRows(sample, manifest.teams);
  return (
    <section className="stp-drives" aria-labelledby="stp-drives-h" data-stp-drive-table="">
      <h3 id="stp-drives-h">Recorded drives · run #{sample.runIndex.toLocaleString("en-US")}</h3>
      <p>{PUBLIC_THEATER_LABEL_LINE} · every row is a recorded drive of this one simulated run; nothing here is a real game or a forecast.</p>
      <div className="stp-scroll" role="region" aria-label="Recorded drive table" tabIndex={0}>
        <table className="stp-table">
          <caption className="stp-sr">Every drive of simulated run #{sample.runIndex} of {manifest.teams.away.abbr} at {manifest.teams.home.abbr}, in order, as recorded by the drive engine</caption>
          <thead>
            <tr>
              <th scope="col">#</th><th scope="col">Start</th><th scope="col">Ball</th><th scope="col">From</th>
              <th scope="col">Plays</th><th scope="col">Yards</th><th scope="col">Time</th><th scope="col">Result</th><th scope="col">Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.n} data-stp-drive={r.n}>
                <th scope="row">{r.n}</th><td>{r.start}</td><td>{r.offense}</td><td>{r.from}</td>
                <td>{r.plays}</td><td>{r.yards}</td><td>{r.time}</td><td>{r.result}</td><td>{r.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function PublicTheaterSection({ rec }: { rec: Rec }) {
  const load = publicTheaterLoad(rec) as TheaterLoad;
  const sample = load.ok && load.manifest ? (defaultSample(load.manifest) as TheaterSample | null) : null;
  return (
    <section className="stp" aria-labelledby="stp-h" data-stp-section="" data-stp-state={load.ok && sample ? "ready" : "unavailable"}>
      <div className="stp-head">
        <h2 id="stp-h">Simulation replay</h2>
        <span className="stp-beta">Public beta</span>
      </div>
      <Labels />
      <Methodology />
      {load.ok && load.manifest && sample ? (
        <>
          <TheaterSection load={load} />
          <DriveTable manifest={load.manifest} sample={sample} />
        </>
      ) : (
        <div className="st-root" style={THEATER_VARS as CSSProperties}>
          <Unavailable title={UNAVAILABLE_TITLE} reason={`${load.error?.code ?? "UNAVAILABLE"}: ${load.error?.reason ?? "no receipt"}`} />
        </div>
      )}
    </section>
  );
}
