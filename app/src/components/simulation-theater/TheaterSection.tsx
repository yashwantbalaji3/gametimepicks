/**
 * Simulation Theater V2 · server shell (spec §3.7 static fallback). Renders, with no JavaScript at all: the banner, the
 * sample list (anchors), the FINAL frame of the default sample as real SVG, its linescore and full transcript, and a
 * <noscript> note. The client island replaces this shell once loaded (TheaterLoader); playback never starts by itself.
 */
import { FieldOverlay, StaticField } from "./FieldScene";
import type { Frame, Palette } from "./FieldScene";
import { Banner, Linescore, SceneBadge, ScoreBug, Transcript, Unavailable } from "./parts";
import TheaterLoader from "./TheaterLoader";
import { THEATER_CSS, THEATER_VARS } from "./theater-css";
import type { CSSProperties } from "react";
import type { TheaterLoad, TheaterManifest, TheaterSample } from "./types";
import { LABELS, chipTitle, finalLine } from "@/lib/simulation-theater/format.mjs";
import { finalState } from "@/lib/simulation-theater/state-at.mjs";
import { theaterPalette } from "@/lib/simulation-theater/nfl-team-colors.mjs";

function FinalFrame({ manifest, sample }: { manifest: TheaterManifest; sample: TheaterSample }) {
  const palette = theaterPalette(manifest.teams.home.abbr, manifest.teams.away.abbr) as Palette;
  const s = finalState(manifest, sample) as Frame & { score: { home: number; away: number }; period: number; periodClock: number };
  return (
    <>
      <div style={{ marginTop: 14 }}>
        <ScoreBug teams={manifest.teams} palette={palette} score={s.score} offense={null} period={s.period} periodClock={s.periodClock} clockIllustrative={false} stateChip="FINAL" illusId="st-ssr-illus" />
      </div>
      <div className="st-fieldcard">
        <SceneBadge />
        <div className="st-fieldwrap">
          <StaticField palette={palette} width={1200} idPrefix="st-ssr" />
          <div className="st-vignette" aria-hidden="true" />
          <FieldOverlay width={1200} height={533} frame={s} palette={palette} teams={manifest.teams} reducedMotion={false} />
        </div>
        <div className="st-caption"><span>Final frame of run #{sample.runIndex}: the last drive&apos;s recorded start and end spots.</span></div>
      </div>
    </>
  );
}

export default function TheaterSection({ load }: { load: TheaterLoad }) {
  if (!load.ok || !load.manifest) {
    return (
      <div className="st-root" style={THEATER_VARS as CSSProperties}>
        <style dangerouslySetInnerHTML={{ __html: THEATER_CSS }} />
        <Unavailable title="Playback unavailable for this receipt" reason={`${load.error?.code ?? "UNAVAILABLE"}: ${load.error?.reason ?? "no receipt"}`} />
      </div>
    );
  }
  const manifest = load.manifest;
  const first = manifest.chips.find((c) => c.available);
  const sample = first ? manifest.samples[first.sampleIndex] : null;
  const shell = (
    <div className="st-root" style={THEATER_VARS as CSSProperties}>
      <style dangerouslySetInnerHTML={{ __html: THEATER_CSS }} />
      <Banner manifest={manifest} sample={sample} />
      <noscript><p className="st-rule">{LABELS.noscript}</p></noscript>
      <nav className="st-samples" aria-label="Representative runs">
        <div className="st-samples-head"><span>Samples</span><span className="st-samplelabel">{LABELS.sample}</span></div>
        <div className="st-chips">
          {manifest.chips.map((c) => {
            const s = manifest.samples[c.sampleIndex];
            return (
              <a key={c.runIndex} className="st-chip" href={`#st-transcript-${c.runIndex}`} aria-current={sample && c.runIndex === sample.runIndex ? "true" : undefined}>
                <span>{chipTitle(c.kinds)}</span>
                {s.finalScore ? <span className="st-chip-score">{finalLine(s.finalScore, manifest.teams)}</span> : null}
              </a>
            );
          })}
        </div>
      </nav>
      {sample ? (
        <>
          <FinalFrame manifest={manifest} sample={sample} />
          <div className="st-below">
            <section className="st-box" aria-label="Linescore"><h2>Linescore · run #{sample.runIndex}</h2><Linescore sample={sample} teams={manifest.teams} /></section>
            <section className="st-box" aria-label="Transcripts">
              {manifest.samples.filter((s, i) => s.validation.ok && manifest.chips.some((c) => c.sampleIndex === i)).map((s) => (
                <Transcript key={s.runIndex} sample={s} teams={manifest.teams} current={null} open={s.runIndex === sample.runIndex} />
              ))}
            </section>
          </div>
        </>
      ) : (
        <Unavailable title="Playback unavailable" reason="No representative run of this receipt passed validation." />
      )}
    </div>
  );
  return <TheaterLoader manifest={manifest}>{shell}</TheaterLoader>;
}
