/**
 * Simulation Theater V2 · server shell (spec §3.7 static fallback). Renders, with no JavaScript at all: the banner, the
 * sample list, the FINAL frame of the default sample as real SVG, its linescore and full transcript, and a <noscript>
 * note. The client island replaces this shell once loaded (TheaterLoader); playback never starts by itself.
 *
 * PAYLOAD (iteration 2). Everything this server component renders is serialized twice into the exported page (HTML and
 * the RSC payload), so the shell renders only the DEFAULT run (as spec §3.7 lists it) and the island receives the five
 * samples once, as the compact `theater-pack@1` transport. The stylesheet is a CSS file (theater.css), not an inline
 * <style>, so it is neither inlined twice nor shipped inside the island's JavaScript.
 */
import "./theater.css";
import { DetachedBall, FieldLive, FieldMarks, StaticField } from "./FieldScene";
import type { Frame, Palette } from "./FieldScene";
import { Banner, FieldLegend, Linescore, SceneBadge, ScoreBug, Transcript, Unavailable } from "./parts";
import TheaterLoader from "./TheaterLoader";
import { THEATER_VARS } from "./theater-css";
import type { CSSProperties } from "react";
import type { TheaterLoad, TheaterManifest, TheaterSample } from "./types";
import { LABELS, chipTitle, finalLine } from "@/lib/simulation-theater/format.mjs";
import { finalState } from "@/lib/simulation-theater/state-at.mjs";
import { theaterPalette } from "@/lib/simulation-theater/nfl-team-colors.mjs";
import { fieldMap, overlayFrame } from "@/lib/simulation-theater/field-geometry.mjs";
import { packTheater } from "@/lib/simulation-theater/theater-pack.mjs";

const SSR_W = 1200;
const SSR_H = 561;

function FinalFrame({ manifest, sample }: { manifest: TheaterManifest; sample: TheaterSample }) {
  const palette = theaterPalette(manifest.teams.home.abbr, manifest.teams.away.abbr) as Palette;
  const s = finalState(manifest, sample) as Frame & { score: { home: number; away: number }; period: number; periodClock: number; driveIdx: number };
  const ev = sample.events[s.driveIdx];
  const endX = fieldMap(SSR_W, SSR_H).X(ev.offense === "home" ? 110 - ev.fieldEnd : 10 + ev.fieldEnd);
  const o = overlayFrame(s, { W: SSR_W, H: SSR_H });
  return (
    <div className="st-broadcast">
      <ScoreBug teams={manifest.teams} palette={palette} score={s.score} offense={null} period={s.period} periodClock={s.periodClock} clockIllustrative={false} stateChip="FINAL" illusId="st-ssr-illus" />
      <SceneBadge />
      <div className="st-fieldwrap">
        <StaticField palette={palette} idPrefix="st-ssr" />
        <FieldMarks W={SSR_W} H={SSR_H} palette={palette} teams={manifest.teams} />
        {/* drawn at SSR_W × SSR_H and stretched to the box; the ball is detached so it never stretches (iteration 3) */}
        <FieldLive W={SSR_W} H={SSR_H} frame={s} o={o} palette={palette} offenseAbbr={manifest.teams[ev.offense].abbr}
          startTag="START" endTag="END" showEnd endX={endX} idPrefix="st-ssr-l" reducedMotion={false} detachBall />
        <DetachedBall W={SSR_W} H={SSR_H} o={o} idPrefix="st-ssr-b" />
      </div>
      <FieldLegend homeAbbr={manifest.teams.home.abbr} />
      <p className="st-rule">Final frame of run #{sample.runIndex}: the last drive&apos;s recorded start and end spots.</p>
    </div>
  );
}

export default function TheaterSection({ load, devHooks = false }: { load: TheaterLoad; devHooks?: boolean }) {
  if (!load.ok || !load.manifest) {
    return (
      <div className="st-root" style={THEATER_VARS as CSSProperties}>
        <Unavailable title="Playback unavailable for this receipt" reason={`${load.error?.code ?? "UNAVAILABLE"}: ${load.error?.reason ?? "no receipt"}`} />
      </div>
    );
  }
  const manifest = load.manifest;
  const first = manifest.chips.find((c) => c.available);
  const sample = first ? manifest.samples[first.sampleIndex] : null;
  const colors = theaterPalette(manifest.teams.home.abbr, manifest.teams.away.abbr).mode;
  const shell = (
    <div className="st-root" style={THEATER_VARS as CSSProperties} data-st-colors={colors}>
      <Banner manifest={manifest} sample={sample} />
      <noscript><p className="st-rule">{LABELS.noscript}</p></noscript>
      <div className="st-samples">
        <div className="st-samples-head"><span>Representative runs</span><span className="st-samplelabel">{LABELS.sample}</span></div>
        <ul className="st-chips st-chips-static">
          {manifest.chips.map((c) => {
            const s = manifest.samples[c.sampleIndex];
            return (
              <li key={c.runIndex} className="st-chip" aria-current={sample && c.runIndex === sample.runIndex ? "true" : undefined}>
                <span>{chipTitle(c.kinds)}</span>
                {s.finalScore ? <span className="st-chip-score">{finalLine(s.finalScore, manifest.teams)}</span> : null}
              </li>
            );
          })}
        </ul>
      </div>
      {sample ? (
        <>
          <div className="st-grid st-grid-ssr"><div className="st-stage"><FinalFrame manifest={manifest} sample={sample} /></div></div>
          <div className="st-below">
            <section className="st-box" aria-label="Linescore"><h2>Linescore · run #{sample.runIndex}</h2><Linescore sample={sample} teams={manifest.teams} /></section>
            <section className="st-box" aria-label="Transcript"><Transcript sample={sample} teams={manifest.teams} current={null} open /></section>
          </div>
        </>
      ) : (
        <Unavailable title="Playback unavailable" reason="No representative run of this receipt passed validation." />
      )}
    </div>
  );
  return <TheaterLoader pack={packTheater(manifest)} devHooks={devHooks}>{shell}</TheaterLoader>;
}
