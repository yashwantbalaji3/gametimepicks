/**
 * Simulation Theater · Official representative vs What-if parts (both sports; server-safe, no hooks).
 *
 * Founder rule (2026-10-20): the default run is the OFFICIAL REPRESENTATIVE SIMULATION (the stored run closest to the
 * official forecast), shown beside the official expectations; every other run is a WHAT-IF, labelled "Hypothetical"
 * wherever it appears. These parts read only `manifest.representative` (plain JSON from
 * lib/simulation-theater/official-representative.mjs) through lib/simulation-theater/representative-labels.mjs:
 *
 *   OfficialForecastCard   the official forecast's own numbers — the headline, never the drive engine's batch
 *   RunRoleNotice          per selected run: "Official representative simulation · … · distance d" or the persistent
 *                          "Hypothetical scenario — not the forecast" banner + "What-if · hypothetical · <kind>"
 *   RoleTag                the short tag on a run chip
 *   OfficialComparison     official expectation vs this simulated game (team terms) + the reconciliation note
 */
import type { TheaterRepresentative } from "./types";
import {
  COMPARISON_TITLE, NO_OFFICIAL_NBA, NO_OFFICIAL_NFL, NO_OFFICIAL_RUNS_NOTE, OFFICIAL_FORECAST_TITLE, OFFICIAL_RUN_SUBTITLE, OFFICIAL_RUN_TITLE,
  RECONCILIATION_NOTE, WHAT_IF_BANNER, WHAT_IF_TAG, fmtDistance, fmtExpectation, fmtPct, fmtSignedDiff, runRole, teamComparison, ROLE, SUPPORTING_RUN_TITLE, SUPPORTING_RUN_SUBTITLE } from "@/lib/simulation-theater/representative-labels.mjs";

type Team = { abbr: string; name?: string | null };
type Teams = { home: Team; away: Team };
type WithRep = { representative?: TheaterRepresentative | null };
type Final = { home: number; away: number } | null | undefined;

const noOfficialText = (rep: TheaterRepresentative | null | undefined) => (rep?.sport === "NBA" ? NO_OFFICIAL_NBA : NO_OFFICIAL_NFL);

/** The official forecast's numbers (the headline). No official forecast ⇒ the truthful "No official …" line. */
export function OfficialForecastCard({ manifest, teams }: { manifest: WithRep; teams: Teams }) {
  const rep = manifest.representative ?? null;
  const o = rep?.official ?? null;
  if (!rep || !o) {
    return (
      <section className="st-official is-none" aria-label={OFFICIAL_FORECAST_TITLE} data-st-official="none" data-st-official-refusal={rep?.refusal?.code ?? "NO_OFFICIAL"}>
        <p className="st-official-h"><b>{noOfficialText(rep)}</b></p>
        <p className="st-official-note">{NO_OFFICIAL_RUNS_NOTE}{rep?.refusal ? ` (${rep.refusal.code})` : ""}</p>
      </section>
    );
  }
  const t = o.team;
  const ps = o.projectedScore;
  return (
    <section className="st-official" aria-label={OFFICIAL_FORECAST_TITLE} data-st-official="" data-st-official-snapshot={o.snapshotId}>
      <p className="st-official-h"><b>{OFFICIAL_FORECAST_TITLE}</b> <span className="st-official-src">· {o.modelVersion ?? "official model"}{o.publication === "PRIVATE" ? " · private" : ""}</span></p>
      <dl className="st-official-kv">
        <div><dt>Win probability</dt><dd data-st-official-win="">{teams.away.abbr} {fmtPct(o.pAway)} · {teams.home.abbr} {fmtPct(o.pHomePublished ?? o.pHome)}</dd></div>
        {ps.home != null && ps.away != null ? <div><dt>Projected score</dt><dd data-st-official-score="">{teams.away.abbr} {fmtExpectation(ps.away)} – {fmtExpectation(ps.home)} {teams.home.abbr}</dd></div> : null}
        <div><dt>Expected points</dt><dd>{teams.away.abbr} {fmtExpectation(t.away?.expected)} · {teams.home.abbr} {fmtExpectation(t.home?.expected)}</dd></div>
        <div><dt>Margin ({teams.home.abbr} − {teams.away.abbr})</dt><dd>{fmtExpectation(t.margin?.expected)}{t.margin?.median != null ? ` · median ${fmtExpectation(t.margin.median)}` : ""}</dd></div>
        <div><dt>Total points</dt><dd>{fmtExpectation(t.total?.expected)}{t.total?.median != null ? ` · median ${fmtExpectation(t.total.median)}` : ""}</dd></div>
      </dl>
      <p className="st-official-note">These are the forecast&apos;s own numbers. Each run below is one simulated game; the default is the stored run closest to them.</p>
    </section>
  );
}

/** The short tag on a run chip / outcome button. */
export function RoleTag({ manifest, runIndex }: { manifest: WithRep; runIndex: number }) {
  const r = runRole(manifest, runIndex);
  if (r.role === ROLE.SUPPORTING_RUN) return <span className="st-roletag is-supporting" data-st-role="supporting">Simulated run</span>;
  return <span className={`st-roletag${r.hypothetical ? " is-whatif" : " is-official"}`} data-st-role={r.hypothetical ? "what-if" : "official"}>{r.hypothetical ? WHAT_IF_TAG : "Official representative"}</span>;
}

/** Under the run selector: what the selected run IS. A what-if always carries the persistent hypothetical banner. */
export function RunRoleNotice({ manifest, runIndex, kindTitle }: { manifest: WithRep; runIndex: number; kindTitle: string | null }) {
  const rep = manifest.representative ?? null;
  const r = runRole(manifest, runIndex, kindTitle);
  if (r.role === ROLE.SUPPORTING_RUN && rep) {
    return (
      <div className="st-rolenote is-supporting" role="note" data-st-role-note="supporting" data-st-distance={rep.distance ?? ""}>
        <p><b>{SUPPORTING_RUN_TITLE}</b> · {SUPPORTING_RUN_SUBTITLE}</p>
        <p className="st-rolenote-fine">One real stored run of the supporting simulation engine (distance {fmtDistance(rep.distance)} from the official projection). It is not the official forecast and changes no official number; the official projection panel shows the canonical forecast.</p>
      </div>
    );
  }
  if (!r.hypothetical && rep) {
    return (
      <div className="st-rolenote is-official" role="note" data-st-role-note="official" data-st-distance={rep.distance ?? ""}>
        <p><b>{OFFICIAL_RUN_TITLE}</b> · {OFFICIAL_RUN_SUBTITLE} · distance {fmtDistance(rep.distance)}{rep.withinTolerance ? "" : ` (outside the ${rep.tolerance} tolerance: no stored run is closer)`}</p>
        <p className="st-rolenote-fine">One real stored run, chosen by {rep.rule}: the smallest normalised distance to the official expected home and away points, margin and total{rep.sport === "NBA" ? " and player averages" : ""}. It is one simulated game, not the forecast&apos;s average.</p>
      </div>
    );
  }
  return (
    <div className="st-rolenote is-whatif" role="note" data-st-role-note="what-if">
      <p className="st-whatif-banner" data-st-whatif-banner="">{WHAT_IF_BANNER}</p>
      <p><b>{r.line}</b>{r.distance != null ? ` · distance ${fmtDistance(r.distance)} from the official forecast` : ""}</p>
    </div>
  );
}

/** Official expectation beside the run's whole-number result, for the team terms, with the reconciliation rule. */
export function OfficialComparison({ manifest, final, teams, hypothetical }: { manifest: WithRep; final: Final; teams: Teams; hypothetical: boolean }) {
  const rep = manifest.representative ?? null;
  const rows = teamComparison(manifest, final, teams) as { term: string; label: string; official: number | null; median: number | null; run: number; diff: number | null }[];
  if (!rep?.official || !rows.length) {
    return (
      <section className="st-compare is-none" data-st-compare="none" aria-label={COMPARISON_TITLE}>
        <p className="st-official-note"><b>{noOfficialText(rep)}</b>: no official expectation to show beside this run.</p>
      </section>
    );
  }
  return (
    <section className={`st-compare${hypothetical ? " is-whatif" : ""}`} data-st-compare="" aria-label={COMPARISON_TITLE}>
      {hypothetical ? <p className="st-whatif-banner" data-st-whatif-banner="">{WHAT_IF_BANNER}</p> : null}
      <table className="st-compare-table">
        <caption>{COMPARISON_TITLE}{hypothetical ? ` · ${WHAT_IF_TAG}` : ""}</caption>
        <thead>
          <tr><th scope="col">Term</th><th scope="col">Official expectation</th><th scope="col">{hypothetical ? "This hypothetical game" : "This simulated game"}</th><th scope="col">Difference</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.term} data-st-compare-term={r.term}>
              <th scope="row">{r.label}</th>
              <td data-st-official-exp="">{fmtExpectation(r.official)}{r.median != null ? <span className="st-compare-med"> · median {fmtExpectation(r.median)}</span> : null}</td>
              <td data-st-run-value="">{r.run}</td>
              <td>{fmtSignedDiff(r.diff)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="st-compare-note" data-st-reconciliation="">{RECONCILIATION_NOTE}</p>
    </section>
  );
}
