"use client";
/**
 * RESEARCH LAB (v1.5) — one static shell, three modes, all state in the URL.
 *
 *   /research/lab/?mode=games&sport=nfl&season=NFL-2025&team=kansas-city-chiefs&result=W
 *
 * The reader builds a typed query; `lib/lab/query.mjs` validates it and writes its ONE canonical URL; the browser
 * fetches ONE selector index and ONE row partition from `/data/lab/v1/`; `lib/lab/engine.mjs` — the same pure
 * function the unit tests pin — filters, sorts and pages the rows. Nothing is stored on the device, no Live or
 * provider request is made, and nothing here computes a rate, a ranking or a probability.
 *
 * Name search only FINDS a candidate; selection writes the canonical slug of that exact index row.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import SearchableSelect, { type SearchableOption } from "@/components/searchable-select";
import { PANEL, Section } from "@/components/research-pages/research-primitives";
import { comparePath } from "@/lib/compare/contract.mjs";
import {
  ALL_SEASONS, ALL_SEASONS_MODES, LAB_BUDGET, LAB_MODES, LAB_MODE_SPORTS, LAB_ROUTE, labAssetPath, labBlocker, labModeSupports,
} from "@/lib/lab/contract.mjs";
import { LAB_SORT_FIELDS, labField } from "@/lib/lab/fields.mjs";
import {
  HA_LABEL, MODE_LABEL, MODE_SUB, MODE_TITLE, RESULT_LABEL, SPORT_NAME, blockedText, coveragePeriod,
  coverageText, errorText, resultCountText, seasonLabel, sortOptionText,
} from "@/lib/lab/copy.mjs";
import { defaultLabQuery, parseLabQuery, queryPartitions, serializeLabQuery, switchTarget, validateLabQuery } from "@/lib/lab/query.mjs";
import { labDataset } from "@/lib/lab/dataset.mjs";
import { executeLabQuery } from "@/lib/lab/engine.mjs";
import { formatGameDate } from "@/lib/research-pages/format.mjs";
import { BoundInput, CopyLinkButton, EntityCell, Field, FilterGroup, NotRecorded, Notice, Pager, TableRegion, cell, head, num, pillStyle, selectStyle, useLabAssets, useLocationSearch } from "./lab-ui";

type Mode = "games" | "players" | "seasons";
const isMode = (v: string | null): v is Mode => LAB_MODES.includes(v as Mode);

/** mode and sport decide WHICH index to fetch, so they are read before the grammar runs. */
function readTarget(search: string): { mode: Mode; sport: string; bad: string | null } {
  const p = new URLSearchParams(search);
  const rawMode = p.get("mode");
  const rawSport = p.get("sport");
  const mode: Mode = isMode(rawMode) ? rawMode : "games";
  if (rawMode && !isMode(rawMode)) return { mode: "games", sport: LAB_MODE_SPORTS.games[0], bad: "UNKNOWN_MODE" };
  const sport = rawSport ? rawSport.toUpperCase() : LAB_MODE_SPORTS[mode][0];
  if (!labModeSupports(mode, sport)) return { mode, sport: LAB_MODE_SPORTS[mode][0], bad: "UNSUPPORTED_SPORT_MODE" };
  return { mode, sport, bad: null };
}

const partitionPath = (query: any) => {
  const p = queryPartitions(query)[0] as { kind: string; sport: string; seasonId?: string };
  return p.kind === "players" ? labAssetPath.players(p.sport, p.seasonId!) : p.kind === "games" ? labAssetPath.games(p.sport) : labAssetPath.seasons(p.sport);
};

export default function ResearchLabApp() {
  const { load, next, isCurrent } = useLabAssets();
  const [search, writeSearch] = useLocationSearch();
  /*
   * The target is memoised BY VALUE, not by identity. It used to be a fresh object on every query change, which
   * re-ran the index effect — clearing `index` AND `rows` — while the row effect's own dependency (the partition
   * path) came back identical and therefore never re-fired. The page then sat on "Applying filters…" for ever
   * after the first filter change. Found in browser QA; pinned by "a filter change keeps the results" below.
   */
  const targetKey = useMemo(() => (search === null ? null : JSON.stringify(readTarget(search))), [search]);
  const target = useMemo(() => (targetKey === null ? null : JSON.parse(targetKey) as { mode: Mode; sport: string; bad: string | null }), [targetKey]);

  const [loaded, setLoaded] = useState<any>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [rows, setRows] = useState<{ path: string; doc: any } | null>(null);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const wanted = useRef<string | null>(null);

  // ── load the selector index for the requested mode + sport ───────────────────────────────────────
  useEffect(() => {
    if (!target) return;
    const token = next();
    setIndexError(null);
    setRows(null);
    load(labAssetPath.index(target.mode, target.sport)).then(
      (doc) => { if (isCurrent(token)) setLoaded(doc); },
      () => { if (isCurrent(token)) setIndexError("ASSET"); },
    );
  }, [target, load, next, isCurrent]);

  /*
   * THE INDEX MUST ANSWER THE MODE BEING RENDERED. The URL changes synchronously and the index loads after, so for
   * one render the reader has asked for Players while the Games index is still in state. Reading the new mode's
   * fields off the old index crashed the page ("cannot read 'NFL-2026' of undefined") — found in browser QA. This
   * is the single place that pairing is enforced: until the right index is in hand, the page is loading.
   */
  const index = loaded && target && loaded.mode === target.mode && loaded.sport === target.sport ? loaded : null;

  const parsed = useMemo(() => (index && search !== null ? parseLabQuery(search, index) : null), [index, search]);
  const checked = useMemo(() => (parsed ? validateLabQuery(parsed.query, index) : null), [parsed, index]);
  const query = checked?.valid ? checked.query : null;
  const needPath = query ? partitionPath(query) : null;
  // The mode tabs and sport chips are rendered before the guards below return, so they read the current query
  // through a ref rather than depending on it existing.
  const queryRef = useRef<any>(null);
  queryRef.current = query;

  // ── load the ONE row partition the valid query needs; the latest query always wins ───────────────
  useEffect(() => {
    if (!needPath) return;
    wanted.current = needPath;
    setRowsError(null);
    load(needPath).then(
      (doc) => { if (wanted.current === needPath) setRows({ path: needPath, doc }); },
      () => { if (wanted.current === needPath) setRowsError("ASSET"); },
    );
  }, [needPath, load]);

  const result = useMemo(() => {
    if (!query || !index || !rows || rows.path !== needPath) return null;
    try { return executeLabQuery(query, labDataset(query.mode, index, rows.doc, 2)); } catch { return "ERROR" as const; }
  }, [query, index, rows, needPath]);

  /* ── writers ─────────────────────────────────────────────────────────────────────────────────── */

  const write = (q: any) => writeSearch(serializeLabQuery(q, index));
  const patch = (p: Record<string, any>) => write({ ...(query as any), page: 1, ...p });
  const setFilter = (field: string, value: any, op: string = "eq") => {
    const others = ((query as any)?.filters ?? []).filter((f: any) => f.field !== field);
    patch({ filters: value == null || value === "" ? others : [...others, { field, op, value }] });
  };
  /*
   * Clearing the team clears what depends on it. A result, a side and a score are only meaningful for somebody, so
   * leaving them behind would turn "show every team" into a refusal the reader did not ask for. This is the same
   * deliberate removal as switching sport — never a silent widening of a filter the reader still wants.
   */
  const setTeam = (id: string | null) => {
    const dependents = ["opponentId", "homeAway", "result", "scored", "allowed"];
    const kept = ((query as any)?.filters ?? []).filter((f: any) => f.field !== "teamId" && !(id == null && dependents.includes(f.field)));
    const sort = id == null ? (query!.sort ?? []).filter((x: any) => !labField(query!.mode, x.field)?.requiresTeam) : query!.sort;
    patch({ filters: id == null ? kept : [...kept, { field: "teamId", op: "eq", value: id }], sort: sort?.length ? sort : undefined });
  };
  const filterOf = (field: string) => (query?.filters ?? []).find((f: any) => f.field === field) ?? null;
  const idOf = (field: string) => { const f = filterOf(field); return f ? (Array.isArray(f.value) ? f.value[0] : f.value) : null; };
  const boundOf = (field: string, which: "min" | "max"): number | null => {
    const f = filterOf(field);
    if (!f) return null;
    if (f.op === "between") return which === "min" ? f.value[0] : f.value[1];
    if (f.op === "gte") return which === "min" ? f.value : null;
    if (f.op === "lte") return which === "max" ? f.value : null;
    return null;
  };
  const setBound = (field: string, which: "min" | "max", n: number | null) => {
    const lo = which === "min" ? n : boundOf(field, "min");
    const hi = which === "max" ? n : boundOf(field, "max");
    const others = ((query as any)?.filters ?? []).filter((f: any) => f.field !== field);
    const clause = lo != null && hi != null ? { field, op: "between", value: [lo, hi] } : lo != null ? { field, op: "gte", value: lo } : hi != null ? { field, op: "lte", value: hi } : null;
    patch({ filters: clause ? [...others, clause] : others });
  };

  /* ── states before a query can run ───────────────────────────────────────────────────────────── */

  if (!target) return <p style={muted}>Loading Research Lab…</p>;
  const sportName = SPORT_NAME[target.sport as keyof typeof SPORT_NAME] ?? target.sport;

  const modeTabs = (
    <nav aria-label="Research Lab searches" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
      {(LAB_MODES as readonly Mode[]).map((m) => {
        const on = m === target.mode;
        const search = switchTarget(queryRef.current ?? { sport: target.sport }, { mode: m });
        return (
          <Link key={m} href={`${LAB_ROUTE}${search}`} aria-current={on ? "page" : undefined} style={pillStyle(on)}
            onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); writeSearch(search); }}>
            {MODE_LABEL[m]}
          </Link>
        );
      })}
    </nav>
  );

  const sportChips = (
    <div role="group" aria-label="Sport" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
      {LAB_MODE_SPORTS[target.mode].map((s) => {
        const on = s === target.sport;
        const search = switchTarget(queryRef.current, { mode: target.mode, sport: s });
        return (
          <Link key={s} href={`${LAB_ROUTE}${search}`} aria-current={on ? "page" : undefined} style={pillStyle(on)}
            onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); writeSearch(search); }}>
            {SPORT_NAME[s as keyof typeof SPORT_NAME]}
          </Link>
        );
      })}
    </div>
  );

  const blockedSports = (["MLB", "NFL", "EPL", "UFC"] as const).filter((s) => labBlocker(target.mode, s));

  const header = (
    <>
      {modeTabs}
      <Section id="lab-query" title={MODE_TITLE[target.mode]} sub={MODE_SUB[target.mode]}>
        {sportChips}
        {blockedSports.length ? (
          <p style={{ ...muted, marginTop: 10 }}>
            {blockedSports.map((s) => <span key={s} style={{ display: "block", marginTop: 2 }}>{blockedText(labBlocker(target.mode, s)!, { sportName: SPORT_NAME[s] })}</span>)}
          </p>
        ) : null}
      </Section>
    </>
  );

  if (target.bad) {
    return (
      <>
        {header}
        <Notice tone="blocked" title="This research link could not be read">
          <p style={{ margin: 0 }}>{errorText(target.bad)}</p>
          <p style={{ margin: "6px 0 0" }}><Link href={LAB_ROUTE} style={linkStyle}>Start a new search</Link></p>
        </Notice>
      </>
    );
  }
  if (indexError) {
    return (
      <>
        {header}
        <Notice tone="blocked" title="Research data could not be loaded">
          Reload the page to try again. Team and player research pages still show the same recorded games.
        </Notice>
      </>
    );
  }
  if (!index || !parsed || !checked) return <>{header}<p style={muted}>Loading the {sportName} {target.mode === "players" ? "player" : "team"} list…</p></>;

  const problems = [...parsed.errors, ...(checked.errors ?? [])];
  if (!query) {
    return (
      <>
        {header}
        <Notice tone="blocked" title="This research link could not be read">
          {[...new Set(problems.map((e: any) => e.code))].map((code) => <p key={code} style={{ margin: "0 0 6px" }}>{errorText(code)}</p>)}
          <p style={{ margin: "6px 0 0" }}>
            <button type="button" onClick={() => writeSearch(serializeLabQuery(defaultLabQuery(index), index))} style={resetLink}>Reset to the latest {seasonLabel(index.seasons[0])} season</button>
          </p>
        </Notice>
      </>
    );
  }

  /* ── controls ────────────────────────────────────────────────────────────────────────────────── */

  /*
   * Selector options. The first entry CLEARS the filter — without it a reader could narrow a search but never widen
   * it again without resetting everything. Only entities the projection gave a slug to are offered: a club with no
   * research page can be an opponent's NAME in a result row, but it can never be selected or put in a share link.
   */
  const entityOptions = (pool: any[], clearLabel: string, exclude?: string | null): SearchableOption[] => [
    { value: null, label: clearLabel },
    ...pool.filter((e) => e[0] && e[1] !== exclude).map((e) => ({ value: e[1], label: e[2], sub: e[3] ?? undefined, searchText: e[0] })),
  ];
  const teamPool = index.teams ?? index.entities;
  const seasonOptions = [...(ALL_SEASONS_MODES.includes(target.mode) ? [ALL_SEASONS] : []), ...index.seasons];
  const sortOptions = LAB_SORT_FIELDS[target.mode].flatMap((f: string) => {
    const def = labField(target.mode, f);
    if (def?.requiresTeam && !filterOf("teamId")) return [];
    if (f === "statValue" && !query.stat) return [];
    return [{ v: `${f}-desc`, label: sortOptionText(f, "desc") }, { v: `${f}-asc`, label: sortOptionText(f, "asc") }];
  });
  const sortValue = `${query.sort[0].field}-${query.sort[0].dir}`;

  const primary = (
    <div style={{ ...PANEL, marginTop: 4, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, alignItems: "end" }}>
      <Field id="lab-season" label="Season">
        <select id="lab-season" value={query.seasonId} onChange={(e) => patch({ seasonId: e.target.value })} style={selectStyle}>
          {seasonOptions.map((s: string) => <option key={s} value={s}>{seasonLabel(s)}</option>)}
        </select>
      </Field>
      {target.mode === "players" ? (
        <>
          <Field id="lab-stat" label="Stat">
            <select id="lab-stat" value={query.stat ?? ""} onChange={(e) => patch({ stat: e.target.value, filters: (query.filters ?? []).filter((f: any) => f.field !== "statValue") })} style={selectStyle}>
              {(index.seasonFamilies[query.seasonId] ?? index.families).map((k: string) => <option key={k} value={k}>{index.familyLabels[k]}</option>)}
            </select>
          </Field>
          <SearchableSelect label="Player" placeholder={`Any ${sportName} player`} value={idOf("playerId")} options={entityOptions(index.entities, `Any ${sportName} player`)} onChange={(id) => setFilter("playerId", id)} emptyMessage="No player in this list" />
        </>
      ) : (
        <SearchableSelect label="Team" placeholder={`Any ${sportName} team`} value={idOf("teamId")} options={entityOptions(index.entities, `Any ${sportName} team`)} onChange={(id) => setTeam(id)} emptyMessage="No team in this list" />
      )}
      <Field id="lab-sort" label="Sort by">
        <select id="lab-sort" value={sortValue} onChange={(e) => { const [f, d] = e.target.value.split("-"); patch({ sort: [{ field: f, dir: d }] }); }} style={selectStyle}>
          {sortOptions.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
      </Field>
    </div>
  );

  const hasTeam = Boolean(filterOf("teamId"));
  const more = (
    <details style={{ marginTop: 12 }}>
      <summary style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center", fontSize: 13.5, fontWeight: 650 }}>More filters</summary>
      <div style={{ ...PANEL, marginTop: 8, display: "grid", gap: 16 }}>
        {target.mode === "games" ? (
          <>
            <FilterGroup legend={hasTeam ? "This team's games" : "Choose a team above to filter by result, side or score"}>
              <SearchableSelect label="Opponent" placeholder="Any opponent" value={idOf("opponentId")} options={entityOptions(teamPool, "Any opponent", idOf("teamId"))} onChange={(id) => setFilter("opponentId", id)} disabled={!hasTeam} emptyMessage="No team in this list" />
              <Field id="lab-result" label="Result">
                <select id="lab-result" value={filterOf("result")?.value ?? ""} onChange={(e) => setFilter("result", e.target.value || null)} disabled={!hasTeam} style={selectStyle}>
                  <option value="">Any result</option>
                  {(labField("games", "result")!.values as string[]).map((v) => <option key={v} value={v}>{RESULT_LABEL[v as keyof typeof RESULT_LABEL]}</option>)}
                </select>
              </Field>
              <Field id="lab-ha" label="Home or away">
                <select id="lab-ha" value={filterOf("homeAway")?.value ?? ""} onChange={(e) => setFilter("homeAway", e.target.value || null)} disabled={!hasTeam} style={selectStyle}>
                  <option value="">Any</option>
                  {(labField("games", "homeAway")!.values as string[]).map((v) => <option key={v} value={v}>{HA_LABEL[v as keyof typeof HA_LABEL]}</option>)}
                </select>
              </Field>
            </FilterGroup>
            <FilterGroup legend="Score">
              <BoundInput id="lab-scored-min" label="Scored at least" value={boundOf("scored", "min")} onChange={(n) => setBound("scored", "min", n)} />
              <BoundInput id="lab-scored-max" label="Scored at most" value={boundOf("scored", "max")} onChange={(n) => setBound("scored", "max", n)} />
              <BoundInput id="lab-allowed-min" label="Allowed at least" value={boundOf("allowed", "min")} onChange={(n) => setBound("allowed", "min", n)} />
              <BoundInput id="lab-allowed-max" label="Allowed at most" value={boundOf("allowed", "max")} onChange={(n) => setBound("allowed", "max", n)} />
              <BoundInput id="lab-total-min" label="Combined at least" value={boundOf("totalScore", "min")} onChange={(n) => setBound("totalScore", "min", n)} />
              <BoundInput id="lab-total-max" label="Combined at most" value={boundOf("totalScore", "max")} onChange={(n) => setBound("totalScore", "max", n)} />
            </FilterGroup>
          </>
        ) : null}
        {target.mode === "players" ? (
          <>
            <FilterGroup legend={`Recorded ${index.familyLabels[query.stat]?.toLowerCase() ?? "value"}`}>
              <BoundInput id="lab-value-min" label="At least" value={boundOf("statValue", "min")} onChange={(n) => setBound("statValue", "min", n)} />
              <BoundInput id="lab-value-max" label="At most" value={boundOf("statValue", "max")} onChange={(n) => setBound("statValue", "max", n)} />
            </FilterGroup>
            <FilterGroup legend="That game">
              <SearchableSelect label="Team in that game" placeholder="Any team" value={idOf("teamId")} options={entityOptions(teamPool, "Any team")} onChange={(id) => setFilter("teamId", id)} emptyMessage="No team in this list" />
              <SearchableSelect label="Opponent" placeholder="Any opponent" value={idOf("opponentId")} options={entityOptions(teamPool, "Any opponent")} onChange={(id) => setFilter("opponentId", id)} emptyMessage="No team in this list" />
              <Field id="lab-pha" label="Home or away">
                <select id="lab-pha" value={filterOf("homeAway")?.value ?? ""} onChange={(e) => setFilter("homeAway", e.target.value || null)} style={selectStyle}>
                  <option value="">Any</option>
                  {(labField("players", "homeAway")!.values as string[]).map((v) => <option key={v} value={v}>{HA_LABEL[v as keyof typeof HA_LABEL]}</option>)}
                </select>
              </Field>
            </FilterGroup>
          </>
        ) : null}
        {target.mode === "seasons" ? (
          <FilterGroup legend="Recorded season numbers">
            <BoundInput id="lab-finals-min" label="Finals at least" value={boundOf("finals", "min")} onChange={(n) => setBound("finals", "min", n)} />
            <BoundInput id="lab-wins-min" label="W at least" value={boundOf("wins", "min")} onChange={(n) => setBound("wins", "min", n)} />
            <BoundInput id="lab-scored-min-s" label="Scored at least" value={boundOf("scored", "min")} onChange={(n) => setBound("scored", "min", n)} />
            <BoundInput id="lab-allowed-max-s" label="Allowed at most" value={boundOf("allowed", "max")} onChange={(n) => setBound("allowed", "max", n)} />
          </FilterGroup>
        ) : null}
        <FilterGroup legend="Dates and page size">
          <Field id="lab-from" label="From">
            <input id="lab-from" type="date" value={dateBound(query, "gte") ?? ""} onChange={(e) => setDate(query, patch, "gte", e.target.value)} style={selectStyle} />
          </Field>
          <Field id="lab-to" label="To">
            <input id="lab-to" type="date" value={dateBound(query, "lte") ?? ""} onChange={(e) => setDate(query, patch, "lte", e.target.value)} style={selectStyle} />
          </Field>
          <Field id="lab-size" label="Rows per page">
            <select id="lab-size" value={query.pageSize} onChange={(e) => patch({ pageSize: Number(e.target.value) })} style={selectStyle}>
              {LAB_BUDGET.pageSizes.map((n: number) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
        </FilterGroup>
      </div>
    </details>
  );

  const actions = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14, alignItems: "center" }}>
      <CopyLinkButton label="Copy link to this search" />
      <button type="button" onClick={() => writeSearch(serializeLabQuery(defaultLabQuery(index), index))} style={pillStyle(false)}>Reset filters</button>
      {compareCta(target.mode, target.sport, index, query)}
    </div>
  );

  const coverage = (
    <div style={{ ...PANEL, marginTop: 16 }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 650 }}>Data available</p>
      <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--vault-text-mute)", lineHeight: 1.55 }}>
        {coveragePeriod({ mode: target.mode, sportName, from: index.coverage.from, to: index.coverage.to })}
      </p>
      <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--vault-text-mute)", lineHeight: 1.55 }}>
        {index.coverage.notes.map((n: string) => <li key={n}>{coverageText(n)}</li>)}
        {target.mode === "players" && index.familyCoverage?.[query.stat] ? <li>{coverageText(index.familyCoverage[query.stat])}</li> : null}
      </ul>
    </div>
  );

  /* ── results ─────────────────────────────────────────────────────────────────────────────────── */

  let results: React.ReactNode;
  if (rowsError) {
    results = <Notice tone="blocked" title="Research data could not be loaded">Reload the page to try again. This is not an empty result — the data for this season could not be read.</Notice>;
  } else if (result === "ERROR") {
    results = <Notice tone="blocked" title="This search could not be run">The data for this season does not match what the Lab expects. Reload the page to try again.</Notice>;
  } else if (!result) {
    results = <p style={{ ...muted, marginTop: 16 }} aria-live="polite">Applying filters…</p>;
  } else {
    results = (
      <>
        <p aria-live="polite" style={{ margin: "16px 0 0", fontSize: 14, fontWeight: 650 }}>{resultCountText(result)}</p>
        {result.totalMatched === 0 ? (
          <Notice>
            Nothing recorded matches every filter at once. Try a different season, or clear a filter — the Lab never loosens a filter for you.
            <span style={{ display: "block", marginTop: 6 }}>
              <button type="button" onClick={() => writeSearch(serializeLabQuery(defaultLabQuery(index), index))} style={resetLink}>Clear filters</button>
            </span>
          </Notice>
        ) : target.mode === "games" ? <GameRows result={result} sport={target.sport} />
          : target.mode === "players" ? <PlayerRows result={result} index={index} />
            : <SeasonRows result={result} />}
        <Pager page={result.page} pageCount={result.pageCount} onPage={(p) => write({ ...query, page: p })} />
      </>
    );
  }

  return (
    <>
      {header}
      {primary}
      {more}
      {actions}
      {coverage}
      {results}
    </>
  );
}

/* ── date helpers (absolute dates only; no "last week" is ever serialized) ───────────────────────── */

const dateBound = (query: any, op: "gte" | "lte"): string | null => {
  const f = (query.filters ?? []).find((x: any) => x.field === "date");
  if (!f) return null;
  if (f.op === "between") return (op === "gte" ? f.value[0] : f.value[1]).slice(0, 10);
  return f.op === op ? String(f.value).slice(0, 10) : null;
};
function setDate(query: any, patch: (p: any) => void, op: "gte" | "lte", value: string) {
  const lo = op === "gte" ? value : dateBound(query, "gte");
  const hi = op === "lte" ? value : dateBound(query, "lte");
  const others = (query.filters ?? []).filter((f: any) => f.field !== "date");
  const clause = lo && hi ? { field: "date", op: "between", value: [lo, hi] } : lo ? { field: "date", op: "gte", value: lo } : hi ? { field: "date", op: "lte", value: hi } : null;
  patch({ filters: clause ? [...others, clause] : others });
}

/* ── discovery: hand a two-entity selection to the tool that already compares two things ─────────── */

function compareCta(mode: string, sport: string, index: any, query: any) {
  const slugOf = (pool: any[], id: string | null) => (id ? pool.find((e: any) => e[1] === id)?.[0] ?? null : null);
  if (mode === "games") {
    const a = slugOf(index.entities, (query.filters ?? []).find((f: any) => f.field === "teamId")?.value ?? null);
    const b = slugOf(index.teams ?? index.entities, (query.filters ?? []).find((f: any) => f.field === "opponentId")?.value ?? null);
    if (!a || !b) return null;
    return <Link href={comparePath("team", sport, { a, b })} style={ctaStyle}>Compare these two teams</Link>;
  }
  if (mode === "players") {
    const a = slugOf(index.entities, (query.filters ?? []).find((f: any) => f.field === "playerId")?.value ?? null);
    if (!a) return null;
    return <Link href={comparePath("player", sport, { a })} style={ctaStyle}>Compare this player with another</Link>;
  }
  return null;
}

/* ── result tables ──────────────────────────────────────────────────────────────────────────────── */

function GameRows({ result, sport }: { result: any; sport: string }) {
  const perspective = Boolean(result.rows[0]?.perspective);
  return (
    <TableRegion label="Recorded games" minWidth={perspective ? 560 : 420}>
      <caption className="sr-only">Recorded final scores matching the selected filters, {result.returned} of {result.totalMatched}</caption>
      <thead>
        <tr>
          <th scope="col" style={head}>Date</th>
          <th scope="col" style={head}>{perspective ? "Team" : "Game"}</th>
          {perspective ? <th scope="col" style={head}>Opponent</th> : null}
          {perspective ? <th scope="col" style={head}>Site</th> : null}
          {perspective ? <th scope="col" style={{ ...head, ...num }}>Scored</th> : <th scope="col" style={{ ...head, ...num }}>Score</th>}
          {perspective ? <th scope="col" style={{ ...head, ...num }}>Allowed</th> : null}
          {perspective ? <th scope="col" style={head}>Result</th> : null}
          <th scope="col" style={head}>Research</th>
        </tr>
      </thead>
      <tbody>
        {result.rows.map((r: any) => (
          <tr key={r.gameId}>
            <td style={cell}>{formatGameDate(r.date)}</td>
            {perspective ? (
              <>
                <td style={cell}><EntityCell href={r.perspective.team?.path}>{r.perspective.team?.label}</EntityCell></td>
                <td style={cell}><EntityCell href={r.opponent?.path}>{r.opponent?.label}</EntityCell></td>
                <td style={cell}>{HA_LABEL[r.perspective.homeAway as keyof typeof HA_LABEL]}</td>
                <td style={{ ...cell, ...num }}>{r.perspective.scored}</td>
                <td style={{ ...cell, ...num }}>{r.perspective.allowed}</td>
                <td style={cell}>{RESULT_LABEL[r.perspective.result as keyof typeof RESULT_LABEL]}</td>
              </>
            ) : (
              <>
                <td style={cell}>
                  <EntityCell href={r.teamA?.path}>{r.teamA?.label}</EntityCell>
                  <span style={{ color: "var(--vault-text-mute)" }}>{r.hostKnown ? " vs " : " vs "}</span>
                  <EntityCell href={r.teamB?.path}>{r.teamB?.label}</EntityCell>
                  {r.hostKnown ? null : <span style={{ fontSize: 11.5, color: "var(--vault-text-mute)" }}> · neutral site</span>}
                </td>
                <td style={{ ...cell, ...num }}>{r.scoreA}–{r.scoreB}</td>
              </>
            )}
            {/* A game with no Matchup Explorer page gets an EMPTY cell, not a dash with screen-reader text: fifty
                rows of "no matchup page" is noise, and the column heading already says what the cell would hold. */}
            <td style={cell}>{r.matchupPath ? <EntityCell href={r.matchupPath}>Matchup</EntityCell> : null}</td>
          </tr>
        ))}
      </tbody>
    </TableRegion>
  );
}

function PlayerRows({ result, index }: { result: any; index: any }) {
  const label = index.familyLabels[result.normalizedQuery.stat] ?? "Value";
  return (
    <TableRegion label="Recorded player games" minWidth={560}>
      <caption className="sr-only">Recorded player game lines matching the selected filters, {result.returned} of {result.totalMatched}</caption>
      <thead>
        <tr>
          <th scope="col" style={head}>Date</th>
          <th scope="col" style={head}>Player</th>
          <th scope="col" style={head}>Team in that game</th>
          <th scope="col" style={head}>Opponent</th>
          <th scope="col" style={head}>Site</th>
          <th scope="col" style={{ ...head, ...num }}>{label}</th>
        </tr>
      </thead>
      <tbody>
        {result.rows.map((r: any) => (
          <tr key={`${r.playerId}|${r.gameId}`}>
            <td style={cell}>{formatGameDate(r.date)}</td>
            <td style={cell}><EntityCell href={r.player?.path}>{r.player?.label}</EntityCell></td>
            <td style={cell}><EntityCell href={r.team?.path}>{r.team?.label ?? <NotRecorded />}</EntityCell></td>
            <td style={cell}><EntityCell href={r.opponent?.path}>{r.opponent?.label ?? <NotRecorded />}</EntityCell></td>
            <td style={cell}>{r.homeAway ? HA_LABEL[r.homeAway as keyof typeof HA_LABEL] : <NotRecorded />}</td>
            <td style={{ ...cell, ...num, fontWeight: 650 }}>{r.value}</td>
          </tr>
        ))}
      </tbody>
    </TableRegion>
  );
}

function SeasonRows({ result }: { result: any }) {
  const ties = result.rows.some((r: any) => r.ties > 0);
  return (
    <TableRegion label="Recorded season results" minWidth={520}>
      <caption className="sr-only">Recorded season results matching the selected filters, {result.returned} of {result.totalMatched}</caption>
      <thead>
        <tr>
          <th scope="col" style={head}>Team</th>
          <th scope="col" style={head}>Season</th>
          <th scope="col" style={{ ...head, ...num }}>Finals</th>
          <th scope="col" style={{ ...head, ...num }}>W</th>
          <th scope="col" style={{ ...head, ...num }}>L</th>
          {ties ? <th scope="col" style={{ ...head, ...num }}>T</th> : null}
          <th scope="col" style={{ ...head, ...num }}>Scored</th>
          <th scope="col" style={{ ...head, ...num }}>Allowed</th>
        </tr>
      </thead>
      <tbody>
        {result.rows.map((r: any) => (
          <tr key={`${r.team?.id}|${r.seasonId}`}>
            <td style={cell}><EntityCell href={r.team?.path}>{r.team?.label}</EntityCell></td>
            <td style={cell}>{seasonLabel(r.seasonId)}</td>
            <td style={{ ...cell, ...num }}>{r.finals}</td>
            <td style={{ ...cell, ...num }}>{r.wins}</td>
            <td style={{ ...cell, ...num }}>{r.losses}</td>
            {ties ? <td style={{ ...cell, ...num }}>{r.ties}</td> : null}
            <td style={{ ...cell, ...num }}>{r.scored}</td>
            <td style={{ ...cell, ...num }}>{r.allowed}</td>
          </tr>
        ))}
      </tbody>
    </TableRegion>
  );
}

const muted: React.CSSProperties = { fontSize: 13, color: "var(--vault-text-mute)", marginTop: 16 };
const linkStyle: React.CSSProperties = { color: "var(--vault-gold-bright)", textDecoration: "underline", textUnderlineOffset: 3 };
const resetLink: React.CSSProperties = { minHeight: 44, background: "transparent", border: 0, color: "var(--vault-gold-bright)", textDecoration: "underline", cursor: "pointer", fontSize: 13.5, padding: 0 };
const ctaStyle: React.CSSProperties = { ...pillStyle(false), textDecoration: "none" };
