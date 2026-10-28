/**
 * SOCIAL GRAPHICS V2 · VERIFIED VIEW-MODELS — what the nfl-social@2 templates may show, built only from GameTimePicks
 * records at one pinned data commit. Prototype (founder review pending); not wired into the daily queue.
 *
 * Founder content decision (2026-10-28): social graphics show the final score, the official pregame predicted winner and
 * its win probability, the top three anytime-touchdown candidates, and those candidates' graded results. They do NOT show
 * projected scores, projected totals or ranges (those stay on the site and in the evidence). Misses are never hidden.
 *
 *   pregameWinner   Format A  the latest frozen version before `now` (recap/freeze-verifier.mjs); labelled as the latest
 *                             published pregame forecast, never as the forecast of record
 *   touchdowns      Format B  top three of the event's published anytime-TD population, by probability:
 *                             mode "pregame" — the player board at the commit (participation from its injury capture);
 *                             mode "record"  — the Forecast Ledger's forecasts of record (published before kickoff)
 *   postgame        Format C  integrity-gated recap facts (recap/fact-bundle-nfl.mjs) + the TD record section
 *
 * Every model carries `evidence` (file@commit + sha256 + ids) for the Command Center, never for the graphic.
 */
import { createHash } from "node:crypto";
import { nflTeamColor } from "../../app/src/lib/simulation-theater/nfl-team-colors.mjs";
import { candidateFor } from "./pipeline.mjs";
import { runIntegrityGate } from "./integrity-gate.mjs";
import { buildFactBundle, claimOf, etDisplay } from "./fact-bundle-nfl.mjs";
import { nflVersions, siteForecast } from "./freeze-verifier.mjs";

export const SOCIAL_V2_SPEC = "nfl-social@2";
const LEDGER = "data/internal/forecast-ledger/v1/nfl.jsonl";
const BOARD = (id) => `app/public/data/nfl/player-board/${id}.json`;
const sha = (s) => createHash("sha256").update(s).digest("hex");
/** The site's own formatter (app/src/app/nfl/game/[eventId]/page.tsx and friends): a post shows what the site shows. */
const pct = (p) => `${(p * 100).toFixed(1)}%`;
/** Participation states that keep a player off a "top three" graphic; QUESTIONABLE is shown, flagged, and needs review. */
const EXCLUDED = new Set(["OUT", "DOUBTFUL", "INACTIVE", "IR", "SUSPENDED", "PUP", "NOT_ON_ROSTER", "RELEASED"]);
const ET = (opts) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", ...opts });
const kickoffLine = (iso) => `${ET({ weekday: "short", month: "short", day: "numeric" }).format(new Date(iso))} · ${ET({ hour: "numeric", minute: "2-digit" }).format(new Date(iso))} ET`;

/** A team as the graphic shows it: verified colours (nfl-team-colors.mjs, evidence-backed) and its own name. */
export function teamOf(abbr, name) {
  const c = nflTeamColor(abbr);
  if (!c) throw new Error(`no verified colour record for ${abbr}`);
  const words = String(name).split(" ");
  // primary + ink for the team's own slab; accent (the record's vivid colour — Steelers gold, not black) for the light
  return { abbr, name, city: words.slice(0, -1).join(" "), nickname: words.at(-1), color: c.primary, ink: c.ink, accent: c.accent };
}

function readLedger(src) {
  const raw = src.read(LEDGER);
  if (raw == null) throw new Error(`${LEDGER} missing at ${src.label}`);
  return { rows: raw.split("\n").filter(Boolean).map((l) => JSON.parse(l)), sha256: sha(raw) };
}
const outcomeOf = (r) => {
  const s = r.settlement ?? {};
  if (s.state === "VOID") return "void";
  if (s.state !== "SETTLED" || s.finality !== "CANONICAL") return "pending";
  if (["YES", "SCORED"].includes(s.finalCategory)) return "hit";
  if (["NO", "DID_NOT_SCORE"].includes(s.finalCategory)) return "miss";
  return "unknown";
};

/** Format A. */
export function pregameWinner({ src, eventId, now }) {
  const versions = nflVersions(src, eventId);
  const kickoff = versions.at(-1)?.kickoffUtc;
  if (!kickoff) return { ok: false, reason: `no forecast versions for ${eventId}` };
  const frozen = versions.filter((v) => Date.parse(v.frozenAt) <= Date.parse(now) && Date.parse(v.frozenAt) < Date.parse(kickoff));
  const v = frozen.at(-1);
  if (!v) return { ok: false, reason: "nothing frozen yet" };
  if (!v.numbers.side) return { ok: false, reason: "the frozen version publishes no side" };
  const r = v.receipt;
  const site = siteForecast(src, eventId);
  const away = teamOf(r.away.abbr, r.away.name);
  const home = teamOf(r.home.abbr, r.home.name);
  const fav = v.numbers.side === "home" ? home : away;
  const afterKickoff = Date.parse(now) >= Date.parse(kickoff);
  return {
    ok: true, format: "pregame-winner", spec: SOCIAL_V2_SPEC, eventId,
    away, home, favoured: v.numbers.side, favouredTeam: fav,
    winProbability: v.numbers.sideProbability, winProbabilityDisplay: v.numbers.sideProbabilityDisplay,
    week: r.week ?? null, kickoff, kickoffLine: kickoffLine(kickoff), frozenAt: v.frozenAt, frozenLine: etDisplay(v.frozenAt),
    stamp: afterKickoff ? "Final pregame forecast" : "Latest published pregame forecast",
    status: afterKickoff ? "HISTORICAL_SAMPLE" : site && site.numbers.sideProbabilityDisplay === v.numbers.sideProbabilityDisplay ? "MATCHES_SITE" : "SITE_DIFFERS",
    evidence: [{ label: "frozen version", ref: `${v.path}@${src.commit?.slice(0, 12)}`, sha256: v.sha256 }, ...(site ? [{ label: "site file", ref: site.path, sha256: site.sha256 }] : [])],
  };
}

/** Format B. */
/** showResults: draw each candidate's graded result (record mode only); false renders the list exactly as published pregame. */
export function touchdowns({ src, eventId, mode, now = null, showResults = mode === "record" }) {
  let pop = [];
  let meta;
  if (mode === "pregame") {
    const raw = src.read(BOARD(eventId));
    if (raw == null) return { ok: false, reason: `no player board for ${eventId}` };
    const b = JSON.parse(raw);
    if (now && Date.parse(now) >= Date.parse(b.kickoffUtc)) return { ok: false, reason: "kickoff has passed: a pregame touchdown graphic would be stale" };
    const fam = b.families?.anytime_td;
    if (fam?.state !== "PUBLISHED") return { ok: false, reason: `anytime TD is ${fam?.state ?? "missing"} on this board` };
    pop = b.players.filter((p) => p.markets?.anytime_td?.probability != null).map((p) => ({
      name: p.name, team: p.team, participation: p.participation ?? "UNKNOWN", probability: p.markets.anytime_td.probability, id: p.playerId ?? p.name,
    }));
    meta = { kickoff: b.kickoffUtc, week: b.week ?? null, matchup: b.matchup, frozenAt: b.generatedAt, basis: fam.basis, availability: b.availability ?? null,
      evidence: [{ label: "player board", ref: `${BOARD(eventId)}@${src.commit?.slice(0, 12)}`, sha256: sha(raw) }] };
  } else {
    const { rows, sha256 } = readLedger(src);
    const all = rows.filter((r) => r.family === "anytime_td" && String(r.eventId) === String(eventId));
    pop = all.filter((r) => r.publicationStatus === "PUBLISHED" && !r.withdrawal && r.publishedAt && Date.parse(r.publishedAt) < Date.parse(r.eventStart))
      .map((r) => ({ name: r.subjectDisplay, team: r.teamId, participation: "PUBLISHED_PREGAME", probability: r.probability, id: r.forecastId, outcome: outcomeOf(r), publishedAt: r.publishedAt }));
    if (!pop.length) return { ok: false, reason: `no anytime-TD forecast of record published before kickoff for ${eventId}` };
    meta = { kickoff: all[0].eventStart, week: nflVersions(src, eventId).at(-1)?.receipt?.week ?? null, matchup: all[0].matchup, frozenAt: pop.map((p) => p.publishedAt).sort().at(-1),
      evidence: [{ label: "Forecast Ledger", ref: `${LEDGER}@${src.commit?.slice(0, 12)}`, sha256 }], excluded: all.length - pop.length };
  }
  const eligible = pop.filter((p) => !EXCLUDED.has(String(p.participation).toUpperCase()));
  eligible.sort((a, b) => b.probability - a.probability || String(a.id).localeCompare(String(b.id)));
  const top = eligible.slice(0, 3);
  // A tie at the cut means "top three" is not well defined: refuse rather than choose.
  if (eligible.length > 3 && eligible[2].probability === eligible[3].probability) return { ok: false, reason: `tie at rank 3 (${pct(eligible[2].probability)})` };
  if (!top.length) return { ok: false, reason: "no eligible candidate" };
  const [awayAbbr, homeAbbr] = String(meta.matchup).split(" @ ");
  const flags = top.filter((p) => String(p.participation).toUpperCase() === "QUESTIONABLE").map((p) => `${p.name} is QUESTIONABLE`);
  return {
    ok: true, format: "touchdowns", spec: SOCIAL_V2_SPEC, eventId, mode, showResults: mode === "record" && showResults,
    away: teamOf(awayAbbr, awayAbbr), home: teamOf(homeAbbr, homeAbbr),
    kickoff: meta.kickoff, kickoffLine: kickoffLine(meta.kickoff), week: meta.week, frozenAt: meta.frozenAt, frozenLine: etDisplay(meta.frozenAt),
    candidates: top.map((p, i) => {
      const c = nflTeamColor(p.team);
      const parts = String(p.name).split(" ");
      const suffix = /^(Jr\.?|Sr\.?|II|III|IV)$/i.test(parts.at(-1)) ? parts.pop() : null;
      return { rank: i + 1, name: p.name, first: parts.slice(0, -1).join(" "), last: `${parts.at(-1)}${suffix ? ` ${suffix}` : ""}`, team: p.team,
        color: c?.primary ?? "#3A3F4B", ink: c?.ink ?? "#FFFFFF", accent: c?.accent ?? c?.primary ?? "#3A3F4B", probability: p.probability, probabilityDisplay: pct(p.probability),
        participation: p.participation, outcome: p.outcome ?? null, id: p.id };
    }),
    populationSize: pop.length, eligibleSize: eligible.length,
    status: flags.length ? "NEEDS_VERIFICATION" : "READY", reasons: flags,
    basis: meta.basis ?? null, evidence: meta.evidence,
  };
}

/** Format C. */
export function postgame({ src, eventId, label }) {
  const { candidate } = candidateFor(eventId, { src });
  const verdict = runIntegrityGate(candidate);
  if (!verdict.pass) return { ok: false, reason: verdict.refusals.map((r) => `${r.code} ${r.detail}`).join("; ") };
  const { bundle } = buildFactBundle(candidate, { label });
  const d = (k) => claimOf(bundle, k);
  const away = teamOf(bundle.teams.away.abbr, bundle.teams.away.name);
  const home = teamOf(bundle.teams.home.abbr, bundle.teams.home.name);
  const fav = bundle.favouredSide === "home" ? home : away;
  const result = d("result.side").value;
  const td = touchdowns({ src, eventId, mode: "record" });
  let tdSection = null;
  if (td.ok) {
    const decided = td.candidates.filter((c) => c.outcome === "hit" || c.outcome === "miss");
    // Only a fully graded list is summarised as "N of 3"; anything pending/void/unknown is shown as such, never as a miss.
    tdSection = { candidates: td.candidates, hits: decided.filter((c) => c.outcome === "hit").length, decided: decided.length, shown: td.candidates.length,
      complete: decided.length === td.candidates.length, evidence: td.evidence };
  }
  return {
    ok: true, format: "postgame", spec: SOCIAL_V2_SPEC, eventId,
    away, home, finalAway: d("final.away").value, finalHome: d("final.home").value,
    winner: d("final.home").value > d("final.away").value ? "home" : d("final.away").value > d("final.home").value ? "away" : "tie",
    favoured: bundle.favouredSide, favouredTeam: fav, winProbabilityDisplay: d("favoured.winProbability").display,
    result, frozenLine: d("frozenAt").display, week: bundle.week, td: tdSection, tdUnavailable: td.ok ? null : td.reason,
    evidence: [{ label: "Forecast Ledger", ref: `${bundle.sources.ledger.path}@${src.commit?.slice(0, 12)}`, sha256: bundle.sources.ledger.sha256 },
      { label: "receipt", ref: bundle.sources.receipt.path, sha256: bundle.sources.receipt.sha256 }, ...(td.ok ? td.evidence : [])],
    warnings: verdict.warnings,
  };
}
