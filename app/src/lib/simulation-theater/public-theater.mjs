/**
 * SIMULATION THEATER V2 · PUBLIC INTEGRATION (P242 narrow exception, founder 2026-10-19: "Public beta if gates pass").
 *
 * The flagged Theater section on the canonical public route /nfl/simulation/[eventId]. Pure apart from reading
 * `process.env` for the flag. docs/launch/approvals/P242_NFL_THEATER_PUBLIC_BETA_2026-10-19.md records the decision.
 *
 * THE FLAG. `GTP_NFL_THEATER_PUBLIC` is read at BUILD time and is ON only when it is exactly "1". next.config.mjs
 * defines it into the bundle ("0" otherwise), so the page's `if (process.env.GTP_NFL_THEATER_PUBLIC === "1")` is a
 * compile-time constant: with the flag OFF webpack never walks the branch, the dynamic import of the section is never
 * created, and the page carries no theater pack, no theater CSS and no island chunk (public-theater-export.test.mjs
 * checks the built HTML). It stays OFF in the branch until acceptance passes and the release-owning session hands off.
 *
 * RECEIPT OF RECORD. The section renders the SAME receipt the page already shows (public-receipt.mjs
 * simulationOfRecord, which the page has resolved and found showable); it never selects its own. If that receipt fails
 * to adapt, or none of its representative runs validates, the section says "Simulation replay unavailable" with the
 * reason, and no pack is serialized.
 */
import { adaptReceipt } from "./adapter-nfl-sim-v2.mjs";
import { fieldPosition, fmtDuration, fmtPeriodClock, plural, scoreLine } from "./format.mjs";

export const NFL_THEATER_PUBLIC_ENV = "GTP_NFL_THEATER_PUBLIC";

/** True only for an explicit "1" (anything else, including unset, is OFF). */
export const nflTheaterPublicEnabled = (env = process.env) => env?.[NFL_THEATER_PUBLIC_ENV] === "1";

/**
 * The four persistent labels on the integrated section, in this order (founder brief 2026-10-19). They sit OUTSIDE the
 * client island, so they are on screen before, during and after playback and with JavaScript off.
 */
export const PUBLIC_THEATER_LABELS = Object.freeze(["SIMULATED", "DRIVE-LEVEL", "MOVEMENT ILLUSTRATIVE", "EXPERIMENTAL MODEL"]);
export const PUBLIC_THEATER_LABEL_LINE = PUBLIC_THEATER_LABELS.join(" · ");

/** The short methodology note (three facts, no claim of accuracy). */
export const PUBLIC_THEATER_METHODOLOGY = Object.freeze([
  Object.freeze({ term: "Recorded", text: "Drive boundaries are recorded facts from this game's drive-engine receipt: which team has the ball, where each drive starts and ends, its plays, net yards, clock used, result and the score, for one simulated run." }),
  Object.freeze({ term: "Illustrative", text: "Movement within a drive is illustrative: the ball's path and the running clock between a drive's recorded start and end are drawn for readability, not recorded." }),
  Object.freeze({ term: "Experimental", text: "This engine is an experimental model and has not been shown to be more accurate than the baseline Game Time Forecast. The replay is one representative simulated game, not a forecast." }),
]);

export const UNAVAILABLE_TITLE = "Simulation replay unavailable";

/**
 * Adapt the page's receipt of record for the section. Same shape as loader.mjs loadTheater (TheaterLoad), but it takes
 * the record the page already resolved, so the page and the section can never show different receipts.
 * @param {{ file: string, receipt: object, showable: boolean } | null} rec  simulationOfRecord(...) output
 */
export function publicTheaterLoad(rec) {
  if (!rec || !rec.receipt) {
    return { eventId: "", file: null, ok: false, error: { code: "NO_RECEIPT", reason: "no receipt generated before kickoff" }, manifest: null, showable: false };
  }
  const eventId = String(rec.receipt.eventId ?? rec.eventId ?? "");
  if (!rec.showable) {
    return { eventId, file: rec.file ?? null, ok: false, error: { code: "NOT_SHOWABLE", reason: (rec.refusals ?? []).join("; ") || "receipt of record is not showable" }, manifest: null, showable: false };
  }
  let a;
  try {
    a = adaptReceipt(rec.receipt, { file: rec.file ?? null });
  } catch (e) {
    return { eventId, file: rec.file ?? null, ok: false, error: { code: "ADAPTER_ERROR", reason: String(e?.message ?? e) }, manifest: null, showable: true };
  }
  if (!a.ok) return { eventId, file: rec.file ?? null, ok: false, error: a.error, manifest: null, showable: true };
  if (!a.manifest.chips.some((c) => c.available)) {
    return { eventId, file: rec.file ?? null, ok: false, error: { code: "NO_VALID_RUN", reason: "no representative run of this receipt passed validation" }, manifest: null, showable: true };
  }
  return { eventId, file: rec.file ?? null, ok: true, error: null, manifest: a.manifest, showable: true };
}

/** The sample the section opens on (and the no-JS drive table shows): the first available chip, as the island does. */
export function defaultSample(manifest) {
  const chip = manifest?.chips?.find((c) => c.available);
  return chip ? manifest.samples[chip.sampleIndex] : null;
}

/**
 * Rows of the server-rendered drive table (the no-JavaScript fallback). Recorded fields only, plus the derived
 * period/clock and field-position language the transcript already uses.
 */
export function driveTableRows(sample, teams) {
  return (sample?.events ?? []).map((ev) => {
    const def = teams[ev.offense === "home" ? "away" : "home"].abbr;
    const result = ev.outcome === "OPP_TD" || ev.outcome === "SAFETY" ? `${ev.outcomeLabel} (${def})` : ev.outcomeLabel;
    return {
      n: ev.index + 1,
      start: fmtPeriodClock(ev.period, ev.periodClockStart),
      offense: teams[ev.offense].abbr,
      offenseSide: ev.offense,
      from: fieldPosition(ev.fieldStart, def),
      plays: plural(ev.plays, "play"),
      yards: plural(ev.netYards, "yard"),
      time: fmtDuration(ev.seconds),
      result,
      score: scoreLine(ev.scoreAfter, teams),
      scoreAfter: { home: ev.scoreAfter.home, away: ev.scoreAfter.away },
    };
  });
}
