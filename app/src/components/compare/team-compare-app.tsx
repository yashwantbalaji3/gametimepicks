"use client";
/**
 * Team Compare (v1.4) — composes ONE team pair in the browser from static assets:
 *   /data/compare/v1/teams/<sport>/index.json   (selector + existing Matchup Explorer pages)
 *   /data/compare/v1/teams/<sport>/<slug>.json  (×2)
 *
 * Numbers come only from lib/compare/team-compare.mjs + head-to-head.mjs (pure, unit-pinned): records over PROVEN
 * finals, points/runs with n, independent recent finals, recorded meetings. No winner row, grade or score. W/L letters
 * appear only on individual factual game rows (text, never colour alone). No storage, no Live, no provider request.
 */
import { useEffect, useMemo, useState } from "react";

import SearchableSelect, { type SearchableOption } from "@/components/searchable-select";
import { MONO, PANEL, ResultBadge, Section } from "@/components/research-pages/research-primitives";
import { BLOCKER, compareAssetPath } from "@/lib/compare/contract.mjs";
import { blockerText, seasonLabel } from "@/lib/compare/copy.mjs";
import { parseCompareQuery, writeCompareQuery } from "@/lib/compare/query.mjs";
import { TEAM_RECENT_SIZES, buildTeamComparison } from "@/lib/compare/team-compare.mjs";
import { coverageNoteText } from "@/lib/research-pages/coverage.mjs";
import { formatGameDate, formatKickoff, formatRecord, isUpcoming } from "@/lib/research-pages/format.mjs";
import { CopyLinkButton, NotRecorded, Notice, SideLink, SizeButtons, cell, head, num, selectStyle, useCompareAssets, useLocationSearch } from "./compare-ui";

type Entry = [string, string, string, string | null, string, string];
interface TeamIndex { kind: "team"; sport: string; entries: Entry[]; matchups: Array<[string, string, string, string, string]>; teams: Record<string, [string, string | null]> }

export default function TeamCompareApp({ sport, sportName }: { sport: "MLB" | "NFL"; sportName: string }) {
  const load = useCompareAssets();
  const [search, writeSearch] = useLocationSearch();
  const [index, setIndex] = useState<TeamIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [entities, setEntities] = useState<Record<string, any>>({});
  const [recentSize, setRecentSize] = useState<number>(TEAM_RECENT_SIZES[0]);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

  useEffect(() => {
    load(compareAssetPath.index("team", sport)).then(setIndex, () => setFailed(true));
  }, [load, sport]);
  const q: { a: { slug: string | null; id: string | null; invalid: boolean }; b: { slug: string | null; id: string | null; invalid: boolean }; stat: string | null; statInvalid: boolean; season: string | null } | null = useMemo(() => (index && search !== null ? (parseCompareQuery(search, index) as any) : null), [index, search]);
  useEffect(() => {
    if (!q) return;
    for (const s of [q.a, q.b]) {
      if (!s.id || entities[s.id]) continue;
      load(compareAssetPath.entity("team", sport, s.slug!)).then((e) => {
        if (e.id !== s.id) throw new Error("slug/id mismatch");
        setEntities((m) => ({ ...m, [e.id]: e }));
      }).catch(() => setFailed(true));
    }
  }, [q, entities, load, sport]);

  if (failed) return <Notice title="Comparison data could not be loaded">Reload the page to try again. Each team&apos;s research page still has its full results.</Notice>;
  if (!index || !q) return <p style={{ fontSize: 13, color: "var(--vault-text-mute)", marginTop: 16 }}>Loading the {sportName} team list…</p>;

  const set = (patch: { a?: string | null; b?: string | null; season?: string | null }) => {
    writeSearch(writeCompareQuery({ aSlug: "a" in patch ? patch.a : q.a.slug, bSlug: "b" in patch ? patch.b : q.b.slug, stat: null, season: "season" in patch ? patch.season : q.season }));
  };
  const slugOf = (id: string | null): string | null => (id ? index.entries.find((e) => e[1] === id)?.[0] ?? null : null);
  const options = (exclude: string | null): SearchableOption[] => index.entries.filter((e) => e[1] !== exclude).map((e) => ({ value: e[1], label: e[2], sub: e[3] ?? undefined, searchText: `${e[0]} ${e[3] ?? ""}` }));
  const name = (id: string | null) => (id && index.teams[id] ? index.teams[id][0] : "Opponent not recorded");
  const unit = sport === "MLB" ? "Runs" : "Points";

  const A = q.a.id ? entities[q.a.id] : null;
  const B = q.b.id ? entities[q.b.id] : null;
  const both = A && B;
  const cmp: any = both ? buildTeamComparison({ a: A, b: B, season: q.season }) : null;
  const elig: any = cmp?.eligibility ?? null;
  const ctx = { kind: "team" as const, sportName };
  const scheduledMeetings = both
    ? index.matchups.filter((m) => (m[1] === A.id && m[2] === B.id) || (m[1] === B.id && m[2] === A.id))
    : [];

  return (
    <div>
      <div style={{ ...PANEL, marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, alignItems: "end" }}>
        <SearchableSelect label="Team A" placeholder={`Select an ${sportName} team`} value={q.a.id} options={options(q.b.id)} onChange={(id) => set({ a: slugOf(id), season: null })} />
        <SearchableSelect label="Team B" placeholder={`Select another ${sportName} team`} value={q.b.id} options={options(q.a.id)} onChange={(id) => set({ b: slugOf(id), season: null })} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" disabled={!q.a.slug && !q.b.slug} onClick={() => writeSearch(writeCompareQuery({ aSlug: q.b.slug, bSlug: q.a.slug, stat: null, season: q.season }))}
            style={{ minHeight: 44, padding: "0 14px", borderRadius: 999, fontSize: 13, cursor: "pointer", background: "transparent", color: "var(--vault-text)", border: "1px solid var(--vault-border)" }}>
            Swap sides
          </button>
          {q.a.slug || q.b.slug ? <button type="button" onClick={() => writeSearch("")} style={{ minHeight: 44, padding: "0 14px", borderRadius: 999, fontSize: 13, cursor: "pointer", background: "transparent", color: "var(--vault-text-mute)", border: "1px solid var(--vault-border)" }}>Clear</button> : null}
        </div>
      </div>

      {q.a.invalid || q.b.invalid ? <Notice tone="blocked" title="This comparison link could not be read">{blockerText(BLOCKER.ENTITY_NOT_PUBLISHED, ctx)}</Notice> : null}
      {!q.a.invalid && !q.b.invalid && !q.a.id && !q.b.id ? <Notice>Select two {sportName} teams to compare their recorded results and meetings.</Notice> : null}
      {!q.a.invalid && !q.b.invalid && (q.a.id ? !q.b.id : !!q.b.id) ? <Notice>Select another {sportName} team.</Notice> : null}
      {q.a.id && q.b.id && !both ? <p style={{ fontSize: 13, color: "var(--vault-text-mute)", marginTop: 16 }}>Loading both teams…</p> : null}

      {both && elig && !elig.eligible ? (
        <Notice tone="blocked" title="No comparison for this selection">
          {elig.blockers.map((b: string) => <p key={b} style={{ margin: "0 0 6px" }}>{blockerText(b, ctx)}</p>)}
          {elig.blockers.includes(BLOCKER.SEASON_NOT_SHARED) ? <button type="button" onClick={() => set({ season: null })} style={{ minHeight: 44, background: "transparent", border: 0, color: "var(--vault-gold-bright)", textDecoration: "underline", cursor: "pointer", fontSize: 13.5, padding: 0 }}>Use the latest shared season</button> : null}
        </Notice>
      ) : null}

      {cmp && elig?.eligible && cmp.season && cmp.recent && cmp.headToHead ? (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginTop: 16 }}>
            <label htmlFor="cmp-team-season" style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>Season</label>
            <select id="cmp-team-season" value={elig.selectedSeason!} onChange={(e) => set({ season: e.target.value })} style={selectStyle}>
              {elig.sharedSeasons.map((s: string) => <option key={s} value={s}>{seasonLabel(s)}</option>)}
            </select>
            <CopyLinkButton />
          </div>

          <Section id="cmp-team-season" title={`${seasonLabel(cmp.season.id)} season`} sub="Only games with an official final score recorded for both teams. Pending and postponed games are not counted.">
            <div data-scroll-x role="region" aria-label="Season comparison table" tabIndex={0} style={{ position: "relative", ...PANEL, overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 320 }}>
                <caption className="sr-only">{seasonLabel(cmp.season.id)} recorded results, {cmp.a!.name} and {cmp.b!.name}</caption>
                <thead><tr><th scope="col" style={head}>Measure</th><th scope="col" style={{ ...head, ...num }}><SideLink href={cmp.a!.path}>{cmp.a!.name}</SideLink></th><th scope="col" style={{ ...head, ...num }}><SideLink href={cmp.b!.path}>{cmp.b!.name}</SideLink></th></tr></thead>
                <tbody>
                  <tr><th scope="row" style={{ ...cell, fontWeight: 500 }}>Record</th><td style={{ ...cell, ...num }}>{formatRecord(cmp.season.a)}</td><td style={{ ...cell, ...num }}>{formatRecord(cmp.season.b)}</td></tr>
                  <tr><th scope="row" style={{ ...cell, fontWeight: 500 }}>Recorded finals (n)</th><td style={{ ...cell, ...num }}>{cmp.season.a.finals}</td><td style={{ ...cell, ...num }}>{cmp.season.b.finals}</td></tr>
                  <tr><th scope="row" style={{ ...cell, fontWeight: 500 }}>{unit} scored</th><td style={{ ...cell, ...num }}>{cmp.season.a.scored ?? <NotRecorded />}</td><td style={{ ...cell, ...num }}>{cmp.season.b.scored ?? <NotRecorded />}</td></tr>
                  <tr><th scope="row" style={{ ...cell, fontWeight: 500 }}>{unit} allowed</th><td style={{ ...cell, ...num }}>{cmp.season.a.allowed ?? <NotRecorded />}</td><td style={{ ...cell, ...num }}>{cmp.season.b.allowed ?? <NotRecorded />}</td></tr>
                  <tr><th scope="row" style={{ ...cell, fontWeight: 500 }}>{unit} scored per final</th><td style={{ ...cell, ...num }}>{cmp.season.a.scoredPerFinal ?? <NotRecorded />}</td><td style={{ ...cell, ...num }}>{cmp.season.b.scoredPerFinal ?? <NotRecorded />}</td></tr>
                  <tr><th scope="row" style={{ ...cell, fontWeight: 500 }}>{unit} allowed per final</th><td style={{ ...cell, ...num }}>{cmp.season.a.allowedPerFinal ?? <NotRecorded />}</td><td style={{ ...cell, ...num }}>{cmp.season.b.allowedPerFinal ?? <NotRecorded />}</td></tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="cmp-team-recent" title="Most recent recorded finals" sub="Each team's own latest finals, across seasons. The two lists are not the same dates.">
            <SizeButtons sizes={TEAM_RECENT_SIZES} value={recentSize} onChange={setRecentSize} label="Recent finals window" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 12 }}>
              {([[cmp.a, cmp.recent[recentSize].a], [cmp.b, cmp.recent[recentSize].b]] as any[]).map(([side, r]: any[]) => (
                <div key={side.id} style={{ ...PANEL, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>{side.name}</p>
                  <p style={{ margin: "2px 0 8px", fontFamily: MONO, fontSize: 11, color: "var(--vault-text-mute)" }}>
                    {r.n < r.size ? `The ${r.n} recorded finals available` : `Last ${r.n} recorded finals`} · {r.w}–{r.l}{r.t ? `–${r.t}` : ""}
                  </p>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
                    {r.games.map((g: any) => (
                      <li key={g.gameId} style={{ display: "flex", flexWrap: "wrap", gap: "2px 8px", alignItems: "center", fontSize: 13 }}>
                        <ResultBadge code={g.result} />
                        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 650 }}>{g.own}–{g.opp}</span>
                        <span style={{ color: "var(--vault-text-mute)" }}>{g.ha === "A" ? "@" : "vs"} {name(g.opponentId)}</span>
                        <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-text-faint)" }}>{formatGameDate(g.date)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>

          <Section id="cmp-team-h2h" title="Recorded meetings" sub={cmp.headToHead.all.recordedFrom ? `Games between these teams with an official final recorded, seasons ${seasonLabel(cmp.headToHead.all.recordedFrom)}–${seasonLabel(cmp.headToHead.all.recordedTo)} in GameTimePicks data. Not an all-time series.` : undefined}>
            <HeadToHeadBlock h={cmp.headToHead.all} aName={cmp.a!.name} bName={cmp.b!.name} />
            {cmp.headToHead.season.record && cmp.headToHead.season.record.meetings !== cmp.headToHead.all.record?.meetings ? (
              <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)" }}>
                In {seasonLabel(cmp.season.id)}: {cmp.headToHead.season.record.meetings} recorded meeting{cmp.headToHead.season.record.meetings === 1 ? "" : "s"}
                {cmp.headToHead.season.record.meetings ? ` (${cmp.a!.name} ${cmp.headToHead.season.record.aWins} · ${cmp.b!.name} ${cmp.headToHead.season.record.bWins}${cmp.headToHead.season.record.ties ? ` · ties ${cmp.headToHead.season.record.ties}` : ""})` : ""}.
              </p>
            ) : null}
            {scheduledMeetings.length ? (
              <div style={{ marginTop: 12 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 650 }}>Scheduled meetings with matchup research</p>
                <ul style={{ listStyle: "none", margin: "4px 0 0", padding: 0, display: "grid", gap: 4 }}>
                  {scheduledMeetings.map((m) => (
                    <li key={m[0]} style={{ fontSize: 13, display: "flex", flexWrap: "wrap", gap: "2px 10px", alignItems: "center" }}>
                      <span>{name(m[1])} at {name(m[2])}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-text-mute)" }}>{formatKickoff(m[3])}{now !== null && !isUpcoming(m[3], now) ? " · scheduled start has passed" : ""}</span>
                      <SideLink href={m[4]}>Matchup research</SideLink>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Section>

          <Section id="cmp-team-coverage" title="Coverage" sub="What these numbers are built from.">
            <ul style={{ ...PANEL, margin: 0, paddingLeft: 30, fontSize: 12.5, color: "var(--vault-text-mute)", lineHeight: 1.55 }}>
              {[...new Set([...A.coverage.notes, ...B.coverage.notes])].map((n) => <li key={n}>{coverageNoteText(n, A.coverage)}</li>)}
              <li>Results recorded through {formatGameDate(A.resultsThrough)} ({A.name}) and {formatGameDate(B.resultsThrough)} ({B.name}).</li>
              <li>A comparison describes recorded games only. It is not a forecast.</li>
            </ul>
          </Section>
        </>
      ) : null}
    </div>
  );
}

export function HeadToHeadBlock({ h, aName, bName, gameHrefs = {} }: { h: any; aName: string; bName: string; gameHrefs?: Record<string, string> }) {
  if (!h?.record) return null;
  if (!h.record.meetings) return <p style={{ fontSize: 13, color: "var(--vault-text-mute)", margin: 0 }}>No recorded meeting between these teams in GameTimePicks data.</p>;
  return (
    <div style={{ ...PANEL }}>
      <p style={{ margin: 0, fontSize: 14 }}>
        <strong style={{ fontVariantNumeric: "tabular-nums" }}>{h.record.meetings}</strong> recorded meeting{h.record.meetings === 1 ? "" : "s"}:
        {" "}{aName} {h.record.aWins} · {bName} {h.record.bWins}{h.record.ties ? ` · ties ${h.record.ties}` : ""}
      </p>
      <div data-scroll-x role="region" aria-label="Recorded meetings" tabIndex={0} style={{ position: "relative", overflowX: "auto", marginTop: 8 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 360 }}>
          <caption className="sr-only">Most recent recorded meetings, newest first</caption>
          <thead><tr><th scope="col" style={head}>Date</th><th scope="col" style={head}>Site</th><th scope="col" style={{ ...head, ...num }}>{aName}</th><th scope="col" style={{ ...head, ...num }}>{bName}</th><th scope="col" style={head}><span className="sr-only">Game page</span></th></tr></thead>
          <tbody>
            {h.meetings.map((m: any) => (
              <tr key={m.gameId}>
                <td style={{ ...cell, fontFamily: MONO, fontSize: 11.5, whiteSpace: "nowrap" }}>{formatGameDate(m.date)}</td>
                <td style={cell}>{m.site === "A_HOME" ? `at ${aName}` : m.site === "B_HOME" ? `at ${bName}` : "Neutral site"}</td>
                <td style={{ ...cell, ...num }}>{m.aScore}</td>
                <td style={{ ...cell, ...num }}>{m.bScore}</td>
                <td style={cell}>{gameHrefs[m.gameId] ? <SideLink href={gameHrefs[m.gameId]}>Game</SideLink> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
