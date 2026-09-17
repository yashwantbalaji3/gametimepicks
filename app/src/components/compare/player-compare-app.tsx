"use client";
/**
 * Player Compare (v1.4) — composes ONE pair in the browser from static assets:
 *   /data/compare/v1/players/<sport>/index.json   (selector: slug, canonical id, label, hint, families)
 *   /data/compare/v1/players/<sport>/<slug>.json  (×2, the selected players only)
 *
 * Every number comes from lib/compare/player-compare.mjs — the same pure selector the unit tests pin. The URL holds
 * the state (a, b, stat, season) so a comparison is shareable; nothing is stored on the device, and no Live or
 * provider request is made. Name search only FINDS a candidate; selection is by canonical id through the exact index.
 */
import { useEffect, useMemo, useState } from "react";

import SearchableSelect, { type SearchableOption } from "@/components/searchable-select";
import { MONO, PANEL, Section } from "@/components/research-pages/research-primitives";
import { BLOCKER, compareAssetPath } from "@/lib/compare/contract.mjs";
import { blockerText, familyCoverageText, seasonLabel } from "@/lib/compare/copy.mjs";
import { getPlayerCompareEligibility } from "@/lib/compare/eligibility.mjs";
import { PLAYER_WINDOWS, buildPlayerComparison } from "@/lib/compare/player-compare.mjs";
import { parseCompareQuery, writeCompareQuery } from "@/lib/compare/query.mjs";
import { statFamily } from "@/lib/compare/stat-families.mjs";
import { coverageNoteText } from "@/lib/research-pages/coverage.mjs";
import { formatGameDate } from "@/lib/research-pages/format.mjs";
import { CopyLinkButton, NotRecorded, Notice, RelativeBars, SideLink, SizeButtons, cell, head, num, selectStyle, useCompareAssets, useLocationSearch } from "./compare-ui";

type Entry = [string, string, string, string | null, number[]];
interface PlayerIndex { kind: "player"; sport: string; families: string[]; entries: Entry[]; teams: Record<string, [string, string | null]> }

export default function PlayerCompareApp({ sport, sportName }: { sport: "NFL" | "EPL" | "MLB"; sportName: string }) {
  const load = useCompareAssets();
  const [search, writeSearch] = useLocationSearch();
  const [index, setIndex] = useState<PlayerIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [entities, setEntities] = useState<Record<string, any>>({});
  const [windowSize, setWindowSize] = useState(5);

  useEffect(() => {
    load(compareAssetPath.index("player", sport)).then(setIndex, () => setFailed(true));
  }, [load, sport]);

  const q: { a: { slug: string | null; id: string | null; invalid: boolean }; b: { slug: string | null; id: string | null; invalid: boolean }; stat: string | null; statInvalid: boolean; season: string | null } | null = useMemo(() => (index && search !== null ? (parseCompareQuery(search, index) as any) : null), [index, search]);

  useEffect(() => {
    if (!q) return;
    for (const s of [q.a, q.b]) {
      if (!s.id || entities[s.id]) continue;
      load(compareAssetPath.entity("player", sport, s.slug!)).then((e) => {
        // The file must be the entity the exact index named — never a different id under the same slug.
        if (e.id !== s.id) throw new Error("slug/id mismatch");
        setEntities((m) => ({ ...m, [e.id]: e }));
      }).catch(() => setFailed(true));
    }
  }, [q, entities, load, sport]);

  const familiesOf = (e: Entry | undefined) => (e && index ? e[4].map((i) => index.families[i]) : []);
  const byId = useMemo(() => new Map((index?.entries ?? []).map((e) => [e[1], e])), [index]);

  if (failed) return <Notice title="Comparison data could not be loaded">Reload the page to try again. Each player&apos;s research page still has their full game log.</Notice>;
  if (!index || !q) return <p style={{ fontSize: 13, color: "var(--vault-text-mute)", marginTop: 16 }}>Loading the {sportName} player list…</p>;

  const set = (patch: { a?: string | null; b?: string | null; stat?: string | null; season?: string | null }) => {
    const next = { aSlug: q.a.slug, bSlug: q.b.slug, stat: q.stat, season: q.season, ...("a" in patch ? { aSlug: patch.a } : {}), ...("b" in patch ? { bSlug: patch.b } : {}), ...("stat" in patch ? { stat: patch.stat } : {}), ...("season" in patch ? { season: patch.season } : {}) };
    writeSearch(writeCompareQuery(next));
  };
  const slugOf = (id: string | null): string | null => (id ? byId.get(id)?.[0] ?? null : null);

  const aEntry = q.a.id ? byId.get(q.a.id) : undefined;
  const bEntry = q.b.id ? byId.get(q.b.id) : undefined;
  const aFams = familiesOf(aEntry);
  // Candidate filter (§110): once A is chosen, B's list holds only players sharing at least one family with A.
  const options = (other: Entry | undefined): SearchableOption[] => {
    const need = new Set(familiesOf(other));
    return index.entries
      .filter((e) => !other || (e[1] !== other[1] && familiesOf(e).some((f) => need.has(f))))
      .map((e) => ({ value: e[1], label: e[2], sub: e[3] ?? undefined, searchText: e[0] }));
  };

  const A = q.a.id ? entities[q.a.id] : null;
  const B = q.b.id ? entities[q.b.id] : null;
  const invalidSide = q.a.invalid || q.b.invalid;
  const both = A && B;
  const cmp: any = both && !q.statInvalid ? buildPlayerComparison({ a: A, b: B, stat: q.stat, season: q.season }) : null;
  const elig: any = cmp?.eligibility ?? null;
  const sharedFamilies: string[] = both ? getPlayerCompareEligibility(A, B, {}).sharedStatFamilies : [];
  const fam = cmp?.family ?? null;
  const teamName = (id: string | null) => (id && index.teams[id] ? index.teams[id][1] ?? index.teams[id][0] : null);
  const ctx = { kind: "player" as const, sportName };

  return (
    <div>
      <div style={{ ...PANEL, marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, alignItems: "end" }}>
        <SearchableSelect label="Player A" placeholder={`Select an ${sportName} player`} value={q.a.id} options={options(bEntry)} onChange={(id) => set({ a: slugOf(id), stat: null, season: null })} emptyMessage="No player shares a stat with the other selection" />
        <SearchableSelect label="Player B" placeholder={aEntry ? "Select a player with shared stats" : `Select an ${sportName} player`} value={q.b.id} options={options(aEntry)} onChange={(id) => set({ b: slugOf(id), stat: null, season: null })} emptyMessage="No player shares a stat with the other selection" />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" disabled={!q.a.slug && !q.b.slug} onClick={() => writeSearch(writeCompareQuery({ aSlug: q.b.slug, bSlug: q.a.slug, stat: q.stat, season: q.season }))}
            style={{ minHeight: 44, padding: "0 14px", borderRadius: 999, fontSize: 13, cursor: "pointer", background: "transparent", color: "var(--vault-text)", border: "1px solid var(--vault-border)" }}>
            Swap sides
          </button>
          {q.a.slug || q.b.slug ? (
            <button type="button" onClick={() => writeSearch("")} style={{ minHeight: 44, padding: "0 14px", borderRadius: 999, fontSize: 13, cursor: "pointer", background: "transparent", color: "var(--vault-text-mute)", border: "1px solid var(--vault-border)" }}>Clear</button>
          ) : null}
        </div>
      </div>

      {invalidSide ? <Notice tone="blocked" title="This comparison link could not be read">{blockerText(BLOCKER.ENTITY_NOT_PUBLISHED, ctx)}</Notice> : null}
      {!invalidSide && !q.a.id && !q.b.id ? <Notice>Select two {sportName} players to compare their shared factual game stats.</Notice> : null}
      {!invalidSide && (q.a.id ? !q.b.id : !!q.b.id) ? <Notice>Select another {sportName} player with shared stat coverage. The list only offers players who share at least one recorded stat.</Notice> : null}
      {q.a.id && q.b.id && !both ? <p style={{ fontSize: 13, color: "var(--vault-text-mute)", marginTop: 16 }}>Loading both players…</p> : null}
      {both && q.statInvalid ? <Notice tone="blocked" title="Stat not recognised">{blockerText(BLOCKER.STAT_NOT_SHARED, ctx)} <button type="button" onClick={() => set({ stat: null, season: null })} style={{ minHeight: 44, background: "transparent", border: 0, color: "var(--vault-gold-bright)", textDecoration: "underline", cursor: "pointer", fontSize: 13.5 }}>Use their first shared stat</button></Notice> : null}

      {both && elig && !elig.eligible ? (
        <Notice tone="blocked" title="No comparison for this selection">
          {elig.blockers.map((b: string) => <p key={b} style={{ margin: "0 0 6px" }}>{blockerText(b, ctx)}</p>)}
          {elig.blockers.includes(BLOCKER.STAT_NOT_SHARED) || elig.blockers.includes(BLOCKER.SEASON_NOT_SHARED) ? (
            <button type="button" onClick={() => set({ stat: elig.blockers.includes(BLOCKER.STAT_NOT_SHARED) ? null : q.stat, season: null })} style={{ minHeight: 44, background: "transparent", border: 0, color: "var(--vault-gold-bright)", textDecoration: "underline", cursor: "pointer", fontSize: 13.5, padding: 0 }}>Reset to a shared {elig.blockers.includes(BLOCKER.STAT_NOT_SHARED) ? "stat" : "season"}</button>
          ) : null}
          <p style={{ margin: "6px 0 0" }}>Research pages: <SideLink href={A.path}>{A.name}</SideLink> · <SideLink href={B.path}>{B.name}</SideLink></p>
        </Notice>
      ) : null}

      {cmp && elig?.eligible && fam ? (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginTop: 16 }}>
            <label htmlFor="cmp-stat" style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>Shared stat</label>
            <select id="cmp-stat" value={elig.selectedStat!} onChange={(e) => set({ stat: e.target.value, season: null })} style={selectStyle}>
              {sharedFamilies.map((k: string) => <option key={k} value={k}>{statFamily(k)?.label}</option>)}
            </select>
            <label htmlFor="cmp-season" style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>Shared season</label>
            <select id="cmp-season" value={elig.selectedSeason!} onChange={(e) => set({ season: e.target.value })} style={selectStyle}>
              {elig.sharedSeasons.map((s: string) => <option key={s} value={s}>{seasonLabel(s)}</option>)}
            </select>
            <CopyLinkButton />
          </div>
          {elig.selectedSeason !== elig.sharedSeasons[0] ? null : (
            <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)" }}>
              Season {seasonLabel(elig.selectedSeason)} is the latest season in which both players have recorded {fam.label.toLowerCase()} in GameTimePicks data.
            </p>
          )}

          <Section id="cmp-season-summary" title={`${fam.label} · ${seasonLabel(elig.selectedSeason)} season`} sub="Per-game values over games where the stat was recorded for that player. n is the number of those games; the two players' n can differ.">
            <div data-scroll-x role="region" aria-label="Season comparison table" tabIndex={0} style={{ position: "relative", ...PANEL, overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 320 }}>
                <caption className="sr-only">{fam.label} per game in {seasonLabel(elig.selectedSeason)}, {cmp.a.name} and {cmp.b.name}</caption>
                <thead><tr><th scope="col" style={head}>Measure</th><th scope="col" style={{ ...head, ...num }}>{cmp.a.name}</th><th scope="col" style={{ ...head, ...num }}>{cmp.b.name}</th></tr></thead>
                <tbody>
                  {([
                    ["Games recorded (n)", "n"], ["Average per game", "mean"], ["Median", "median"], ["Lowest", "min"], ["Highest", "max"],
                    ...(fam.total ? [["Season total", "total"]] : []),
                  ] as Array<[string, "n" | "mean" | "median" | "min" | "max" | "total"]>).map(([label, k]) => (
                    <tr key={k}>
                      <th scope="row" style={{ ...cell, fontWeight: 500 }}>{label}</th>
                      <td style={{ ...cell, ...num }}>{cmp.a.season[k] ?? <NotRecorded />}</td>
                      <td style={{ ...cell, ...num }}>{cmp.b.season[k] ?? <NotRecorded />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="cmp-recent" title="Most recent recorded games" sub="Each player's own latest recorded games for this stat, across seasons. The two lists are not the same dates.">
            <SizeButtons sizes={PLAYER_WINDOWS} value={windowSize} onChange={setWindowSize} label="Recent window size" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 12 }}>
              {[cmp.a, cmp.b].map((s: any) => {
                const w = s.windows.find((x: any) => x.size === windowSize);
                const scaleMax = Math.max(...[cmp.a, cmp.b].flatMap((x: any) => x.windows.find((y: any) => y.size === windowSize).values), 1);
                return (
                  <div key={s.id} style={{ ...PANEL, minWidth: 0 }}>
                    <p style={{ margin: 0, fontFamily: MONO, fontSize: 11, color: "var(--vault-text-mute)" }}>
                      {w.complete ? `Last ${w.size} recorded games` : `The ${w.n} recorded game${w.n === 1 ? "" : "s"} available (fewer than ${w.size})`}
                    </p>
                    <p style={{ margin: "4px 0 10px", fontSize: 14 }}>
                      Average <strong style={{ fontVariantNumeric: "tabular-nums" }}>{w.mean ?? "—"}</strong> <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-text-mute)" }}>(n={w.n})</span>
                    </p>
                    <RelativeBars title={`${s.name} · ${fam.label.toLowerCase()}, newest first`} unit={fam.unit} scaleMax={scaleMax}
                      points={w.games.map((g: any) => ({ id: g.gameId, date: formatGameDate(g.date), value: g.value }))} />
                    <div data-scroll-x role="region" aria-label={`${s.name} recent games`} tabIndex={0} style={{ position: "relative", overflowX: "auto", marginTop: 10 }}>
                      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 260 }}>
                        <caption className="sr-only">{s.name} recent recorded games, newest first</caption>
                        <thead><tr><th scope="col" style={head}>Date</th><th scope="col" style={head}>Team</th><th scope="col" style={head}>Opp</th><th scope="col" style={{ ...head, ...num }}>{fam.label}</th></tr></thead>
                        <tbody>
                          {w.games.map((g: any) => (
                            <tr key={g.gameId}>
                              <td style={{ ...cell, fontFamily: MONO, fontSize: 11.5, whiteSpace: "nowrap" }}>{formatGameDate(g.date)}</td>
                              <td style={cell}>{teamName(g.teamId) ?? <NotRecorded />}</td>
                              <td style={cell}>{g.opponentId ? `${g.ha === "A" ? "@ " : "vs "}${teamName(g.opponentId) ?? ""}` : <NotRecorded />}</td>
                              <td style={{ ...cell, ...num }}>{g.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section id="cmp-coverage" title="Coverage" sub="What each side's numbers are built from.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
              {[cmp.a, cmp.b].map((s: any) => (
                <div key={s.id} style={{ ...PANEL, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, overflowWrap: "anywhere" }}><SideLink href={s.path}>{s.name}</SideLink></p>
                  <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)" }}>
                    {fam.label} recorded {formatGameDate(s.recordedFrom)} – {formatGameDate(s.recordedThrough)}
                  </p>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--vault-text-mute)", lineHeight: 1.55 }}>
                    {s.coverage.notes.map((n: string) => <li key={n}>{coverageNoteText(n, s.coverage)}</li>)}
                  </ul>
                </div>
              ))}
            </div>
            {fam.coverage ? <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)" }}>{familyCoverageText(fam.coverage)}</p> : null}
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--vault-text-faint)" }}>A comparison describes recorded games only. It is not a forecast and does not say which player will record more.</p>
          </Section>
        </>
      ) : null}
    </div>
  );
}
