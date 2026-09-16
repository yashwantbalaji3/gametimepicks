"use client";
/**
 * MY GAMETIME (v1.1.3) — "what matters to me in GameTimePicks right now?"
 *
 * A VIEW, NOT A TRUTH OWNER. Every module reads an owner that already exists and only decides which of
 * its rows this browser's follows make relevant:
 *
 *   Live Now          useLiveSlate (the /live batch owner)      MLB followed teams
 *   Up Next           build-time schedule read model            MLB + NFL followed teams
 *   Followed players  /data/my/nfl-players.json (PUBLISHED only) NFL followed players
 *   Saved forecasts   useSavedForecasts (the Saved owner)       preview only
 *   Recent results    canonical result owners                   MLB + NFL followed teams
 *   Following         useFollowing (the Follow owner)           counts + manage link
 *
 * COST. The Live module is a child component mounted ONLY when an MLB team is followed, so a reader who
 * follows none makes ZERO Live requests, and a reader who follows twenty makes the same ONE batch
 * request as a reader who follows one. Following or saving never refetches Live.
 *
 * FAILURE ISOLATION. Modules hold their own data and fail on their own. A broken Live feed does not
 * blank Saved; a corrupt Saved store does not blank Up Next.
 *
 * HYDRATION. Nothing renders an empty or first-run state until BOTH local stores have been read —
 * "not read yet" is not "empty".
 *
 * NO "SINCE YOUR LAST VISIT". Every module shows current state only; nothing here infers change.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import { useFollowing, type FollowRef } from "@/lib/follow/follow-store";
import { useSavedForecasts } from "@/lib/saved/saved-store";
import {
  followsAnyMlbTeam, pageStateFor, selectFollowedLiveEvents, selectFollowedPlayerRows,
  selectRecentFollowedResults, selectUpcomingFollowedGames,
} from "@/lib/my/selectors.mjs";
import { derivePresentationState } from "@/lib/live/lifecycle.mjs";
import { ageSeconds } from "@/lib/live/freshness.mjs";
import { liveReadyFor } from "@/lib/live/client";
import { useLiveSlate } from "@/components/live/use-live-slate";
import type { MyGame, MyPlayerRow, MyReadModel, MyResult } from "@/lib/my/read-model";

const MONO = "var(--font-mono)";
const PREVIEW = 4;

/** The Players file path, as a LITERAL — which is also what keeps the post-build /data sweep from pruning it. */
const PLAYERS_URL = "/data/my/nfl-players.json";

const etDateTime = (iso: string | null) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(t)) + " ET";
};
const etDate = (iso: string | null) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }).format(new Date(t));
};

/* ─────────────────────────── shared chrome ─────────────────────────── */

function Module({ id, title, cta, children }: { id: string; title: string; cta?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`my-${id}`} style={{ marginBottom: 26 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <h2 id={`my-${id}`} style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--vault-text-faint)", fontWeight: 400, margin: 0 }}>
          {title}
        </h2>
        {cta ? (
          <Link href={cta.href} style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--vault-gold-bright)", minHeight: 44, display: "inline-flex", alignItems: "center" }}>
            {cta.label}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 13, color: "var(--vault-text-mute)", margin: 0, lineHeight: 1.55 }}>{children}</p>;
}

const cardStyle: React.CSSProperties = {
  display: "block", textDecoration: "none", color: "inherit", padding: "10px 12px", minHeight: 44,
  border: "1px solid var(--vault-border)", borderRadius: 8, background: "var(--vault-panel)",
};

function MaybeLink({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  // A row with no canonical page is rendered as plain content — never a link that 404s.
  return href ? <Link href={href} aria-label={label} style={cardStyle}>{children}</Link> : <div aria-label={label} style={cardStyle}>{children}</div>;
}

const grid: React.CSSProperties = { display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", listStyle: "none", margin: 0, padding: 0 };

/* ─────────────────────────── Live Now (MLB) ─────────────────────────── */

/**
 * Mounted ONLY when the reader follows an MLB team. Mounting it is what issues the one batch request;
 * not mounting it is what makes the no-MLB-follow case cost nothing.
 */
function LiveNowModule({ followed, upcomingMlbToday }: { followed: FollowRef[]; upcomingMlbToday: MyGame[] }) {
  const { byGamePk, unavailable, loading, freshness } = useLiveSlate("mlb");
  const { events } = selectFollowedLiveEvents(byGamePk, followed);
  const slateHasLive = Object.values(byGamePk).some((e: any) => e?.state === "LIVE" || e?.state === "DELAYED");
  const hrefByPk = new Map(upcomingMlbToday.map((g) => [g.gameId, g.href]));
  const secs = ageSeconds(freshness.ageMs);

  return (
    <Module id="live" title="Live now" cta={{ href: "/live", label: "All live →" }}>
      {!liveReadyFor("mlb") ? (
        <Quiet>Live tracking is currently turned off.</Quiet>
      ) : loading && Object.keys(byGamePk).length === 0 ? (
        <Quiet>Checking the live feed…</Quiet>
      ) : unavailable && Object.keys(byGamePk).length === 0 ? (
        // (4) provider unavailable — distinct from "none of your teams is playing"
        <Quiet>Live data is unavailable right now. Your other modules below are unaffected.</Quiet>
      ) : events.length === 0 ? (
        <Quiet>
          {slateHasLive
            ? "None of the MLB teams you follow is playing right now." // (2)
            : "No MLB games are live right now."}{" "}
          {/* (3) */}
          <Link href="/live" style={{ color: "var(--vault-gold-bright)" }}>See today on Live</Link>
        </Quiet>
      ) : (
        <>
          <ul style={grid}>
            {events.map((e: any) => {
              const life = derivePresentationState({ envelope: e, settlement: null });
              const away = e.competitors?.away;
              const home = e.competitors?.home;
              const score = away?.score === null || home?.score === null ? "no score reported" : `${away?.abbr} ${away?.score}, ${home?.abbr} ${home?.score}`;
              const period = [e.period?.label, typeof e.situation?.outs === "number" ? `${e.situation.outs} out` : null].filter(Boolean).join(" · ");
              return (
                <li key={e.eventId}>
                  <MaybeLink href={hrefByPk.get(String(e.eventId)) ?? null} label={`${away?.name ?? away?.abbr} at ${home?.name ?? home?.abbr}. ${life.label}. ${score}.${period ? ` ${period}.` : ""}`}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", border: "1px solid var(--vault-success)", color: "var(--vault-success)", borderRadius: 3, padding: "1px 6px" }}>{life.label}</span>
                      {period ? <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)" }}>{period}</span> : null}
                    </div>
                    <div aria-hidden="true" style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 15, color: "var(--vault-text)" }}>
                      <span>{away?.abbr} {away?.score ?? "—"}</span>
                      <span>{home?.abbr} {home?.score ?? "—"}</span>
                    </div>
                  </MaybeLink>
                </li>
              );
            })}
          </ul>
          <p style={{ fontFamily: MONO, fontSize: 10, color: freshness.level === "STALE" ? "var(--vault-warn)" : "var(--vault-text-faint)", margin: "6px 0 0" }}>
            {secs === null ? "Live feed age unknown" : freshness.level === "STALE" ? `Live feed delayed — last confirmed ${secs} sec ago` : `Live feed updated ${secs} sec ago · source MLB StatsAPI`}
          </p>
        </>
      )}
    </Module>
  );
}

/* ─────────────────────────── Up Next ─────────────────────────── */

function UpNextModule({ games, total }: { games: MyGame[]; total: number }) {
  return (
    <Module id="upnext" title="Up next">
      {games.length === 0 ? (
        <Quiet>No upcoming games for the teams you follow in the published schedule.</Quiet>
      ) : (
        <>
          <ul style={grid}>
            {games.map((g) => {
              const when = etDateTime(g.startUtc);
              return (
                <li key={`${g.sport}:${g.gameId}`}>
                  <MaybeLink href={g.href} label={`${g.awayName} at ${g.homeName}, ${g.sport}, ${when ?? "time to be confirmed"}.${g.forecast ? " A frozen GameTime pregame forecast is available." : ""}`}>
                    <div style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--vault-text-faint)", marginBottom: 4 }}>{g.sport} · {when}</div>
                    <div style={{ fontSize: 13.5, color: "var(--vault-text)" }}>{g.awayName} <span style={{ color: "var(--vault-text-faint)" }}>at</span> {g.homeName}</div>
                    {g.forecast ? (
                      <div style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--vault-text-faint)", marginTop: 6 }}>
                        Pregame GameTime · frozen · runs {g.forecast.runs.away.rangeLow}–{g.forecast.runs.away.rangeHigh} / {g.forecast.runs.home.rangeLow}–{g.forecast.runs.home.rangeHigh}
                      </div>
                    ) : null}
                  </MaybeLink>
                </li>
              );
            })}
          </ul>
          {total > games.length ? <p style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)", margin: "6px 0 0" }}>Showing the next {games.length} of {total}.</p> : null}
        </>
      )}
    </Module>
  );
}

/* ─────────────────────────── Followed NFL players ─────────────────────────── */

/** Fetches the players file ONLY because this module mounted, and it mounts only for a player follow. */
function PlayersModule({ followed }: { followed: FollowRef[] }) {
  const [rows, setRows] = useState<MyPlayerRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(PLAYERS_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (live) setRows(Array.isArray(j?.rows) ? j.rows : []); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  const followedPlayers = followed.filter((f) => f.sport === "NFL" && f.entityType === "player");
  const labelById = new Map(followedPlayers.map((f) => [f.id, f.label ?? "Followed player"]));

  return (
    <Module id="players" title="Your NFL players" cta={{ href: "/nfl", label: "NFL →" }}>
      {failed ? (
        <Quiet>Player forecasts could not be loaded right now.</Quiet>
      ) : rows === null ? (
        <Quiet>Loading the current player board…</Quiet>
      ) : (() => {
        const { present, absent } = selectFollowedPlayerRows(rows, followed);
        return (
          <>
            {present.length ? (
              <ul style={grid}>
                {present.map((p: MyPlayerRow) => (
                  <li key={p.playerId}>
                    <MaybeLink href={p.href} label={`${p.name}, ${p.team}, ${p.matchup}. Frozen GameTime pregame ranges.`}>
                      <div style={{ fontSize: 13.5, color: "var(--vault-text)" }}>{p.name} <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)" }}>{p.team}</span></div>
                      <div style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--vault-text-faint)", margin: "2px 0 6px" }}>{p.matchup} · {etDateTime(p.kickoffUtc)}</div>
                      {p.markets.length ? (
                        <dl style={{ margin: 0 }}>
                          {p.markets.map((m) => (
                            <div key={m.key} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                              <dt style={{ color: "var(--vault-text-mute)" }}>{m.label}</dt>
                              <dd style={{ margin: 0, fontFamily: MONO, color: "var(--vault-text)" }}>{m.median} <span style={{ color: "var(--vault-text-faint)" }}>({m.p10}–{m.p90})</span></dd>
                            </div>
                          ))}
                        </dl>
                      ) : <Quiet>No current published forecast.</Quiet>}
                    </MaybeLink>
                  </li>
                ))}
              </ul>
            ) : null}
            {absent.length ? (
              <p style={{ fontSize: 12.5, color: "var(--vault-text-mute)", margin: present.length ? "8px 0 0" : 0 }}>
                No current published forecast for {absent.map((id) => labelById.get(id)).join(", ")}.
              </p>
            ) : null}
            <p style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--vault-text-faint)", margin: "6px 0 0" }}>Pregame GameTime ranges · frozen · published families only</p>
          </>
        );
      })()}
    </Module>
  );
}

/* ─────────────────────────── Saved (preview only) ─────────────────────────── */

function SavedModule({ items }: { items: ReturnType<typeof useSavedForecasts>["items"] }) {
  const shown = items.slice(0, PREVIEW); // the Saved owner's own order — not re-ranked here
  return (
    <Module id="saved" title="Saved forecasts" cta={{ href: "/saved", label: "Manage saved →" }}>
      <ul style={grid}>
        {shown.map((s) => (
          <li key={s.id}>
            <MaybeLink href={s.href || null} label={`Saved forecast: ${s.matchup}. ${s.family}: ${s.value}.`}>
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--vault-text-faint)", marginBottom: 4 }}>{s.sport?.toUpperCase?.()} · {etDateTime(s.startUtc) ?? "time unknown"}</div>
              <div style={{ fontSize: 13.5, color: "var(--vault-text)" }}>{s.matchup}</div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-text-mute)", marginTop: 4 }}>{s.family}: {s.value}</div>
            </MaybeLink>
          </li>
        ))}
      </ul>
      {items.length > shown.length ? <p style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)", margin: "6px 0 0" }}>Showing {shown.length} of {items.length}.</p> : null}
    </Module>
  );
}

/* ─────────────────────────── Recent results ─────────────────────────── */

function ResultsModule({ results, total }: { results: MyResult[]; total: number }) {
  return (
    <Module id="results" title="Recent results" cta={{ href: "/results", label: "All results →" }}>
      {results.length === 0 ? (
        <Quiet>No recent final results for the teams you follow yet.</Quiet>
      ) : (
        <>
          <ul style={grid}>
            {results.map((r) => (
              <li key={`${r.sport}:${r.gameId}`}>
                <MaybeLink href={r.href} label={`Final: ${r.awayName} ${r.awayScore}, ${r.homeName} ${r.homeScore}. ${r.sport}.`}>
                  <div style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--vault-text-faint)", marginBottom: 4 }}>{r.sport} · Final · {etDate(r.resultAt)}</div>
                  <div aria-hidden="true" style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13.5, color: "var(--vault-text)" }}>
                    <span>{r.awayName}</span><span style={{ fontFamily: MONO }}>{r.awayScore}</span>
                  </div>
                  <div aria-hidden="true" style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13.5, color: "var(--vault-text)" }}>
                    <span>{r.homeName}</span><span style={{ fontFamily: MONO }}>{r.homeScore}</span>
                  </div>
                </MaybeLink>
              </li>
            ))}
          </ul>
          {total > results.length ? <p style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)", margin: "6px 0 0" }}>Showing the latest {results.length} of {total}.</p> : null}
        </>
      )}
    </Module>
  );
}

/* ─────────────────────────── Following summary ─────────────────────────── */

function FollowingSummary({ list }: { list: ReturnType<typeof useFollowing>["list"] }) {
  const counts = [
    ["MLB team", list({ sport: "MLB", entityType: "team" }).length],
    ["NFL team", list({ sport: "NFL", entityType: "team" }).length],
    ["NFL player", list({ sport: "NFL", entityType: "player" }).length],
  ] as const;
  return (
    <Module id="following" title="Following" cta={{ href: "/following", label: "Manage following →" }}>
      <p style={{ fontSize: 13, color: "var(--vault-text-mute)", margin: 0 }}>
        {counts.map(([label, n]) => `${n} ${label}${n === 1 ? "" : "s"}`).join(" · ")} · saved on this device
      </p>
    </Module>
  );
}

/* ─────────────────────────── the page ─────────────────────────── */

export default function MyGameTime({ model }: { model: MyReadModel }) {
  const follow = useFollowing();
  const saved = useSavedForecasts();
  // The reader's clock, re-ticked each minute so a game that starts leaves Up Next without a rebuild.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // "Not read yet" is not "empty": render nothing personal until BOTH stores have been read.
  if (!follow.ready || !saved.ready) {
    return <p style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-text-faint)" }}>Reading this device…</p>;
  }

  const followed = follow.followed;
  const followStoreBroken = follow.status === "UNAVAILABLE" || follow.status === "UNSUPPORTED_VERSION";
  const state = pageStateFor({ followedCount: followed.length, savedCount: saved.items.length });

  if (state === "FIRST_RUN" && !followStoreBroken) {
    return (
      <section aria-labelledby="my-first-run" style={{ maxWidth: 620, padding: "8px 0" }}>
        <h2 id="my-first-run" style={{ fontFamily: "var(--font-headline)", fontSize: 20, color: "var(--vault-text)", margin: "0 0 8px" }}>Make GameTimePicks yours</h2>
        <p style={{ fontSize: 14, color: "var(--vault-text-mute)", lineHeight: 1.6, margin: "0 0 16px" }}>
          Follow teams and supported players to bring live games, upcoming matchups, saved forecasts, and results into one place on this device.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/following" style={{ minHeight: 44, display: "inline-flex", alignItems: "center", padding: "0 16px", borderRadius: 999, border: "1px solid var(--vault-gold)", color: "var(--vault-gold-bright)", fontFamily: MONO, fontSize: 11.5, textDecoration: "none" }}>Choose what to follow</Link>
          <Link href="/live" style={{ minHeight: 44, display: "inline-flex", alignItems: "center", padding: "0 16px", borderRadius: 999, border: "1px solid var(--vault-border)", color: "var(--vault-text-mute)", fontFamily: MONO, fontSize: 11.5, textDecoration: "none" }}>Browse Live</Link>
          <Link href="/mlb" style={{ minHeight: 44, display: "inline-flex", alignItems: "center", padding: "0 12px", color: "var(--vault-text-mute)", fontFamily: MONO, fontSize: 11.5 }}>MLB</Link>
          <Link href="/nfl" style={{ minHeight: 44, display: "inline-flex", alignItems: "center", padding: "0 12px", color: "var(--vault-text-mute)", fontFamily: MONO, fontSize: 11.5 }}>NFL</Link>
        </div>
      </section>
    );
  }

  const upcoming = selectUpcomingFollowedGames(model.upcoming, followed, { nowMs, limit: PREVIEW });
  const results = selectRecentFollowedResults(model.results, followed, { limit: PREVIEW });
  const followsTeams = followed.some((f) => f.entityType === "team");
  const followsPlayers = followed.some((f) => f.sport === "NFL" && f.entityType === "player");

  return (
    <div>
      {followStoreBroken ? (
        <p role="status" style={{ fontSize: 13, color: "var(--vault-text-mute)", margin: "0 0 18px" }}>
          {follow.status === "UNSUPPORTED_VERSION"
            ? "Your follows were saved by a newer version of GameTimePicks, so this page is leaving them untouched. Reload to pick up the latest version."
            : "Following is unavailable in this browser, so team-based modules are hidden. Saved forecasts below are unaffected."}
        </p>
      ) : null}

      {/* 1 · Live — mounted only for an MLB team follow (zero requests otherwise). */}
      {followsAnyMlbTeam(followed) ? (
        <LiveNowModule followed={followed} upcomingMlbToday={model.upcoming.filter((g) => g.sport === "MLB")} />
      ) : null}

      {/* 2 · Up next */}
      {followsTeams ? <UpNextModule games={upcoming.games} total={upcoming.total} /> : null}

      {/* 3 · Followed NFL players — the players file is fetched only here. */}
      {followsPlayers ? <PlayersModule followed={followed} /> : null}

      {/* 4 · Saved forecasts — the Saved owner's items, previewed. */}
      {saved.items.length ? <SavedModule items={saved.items} /> : null}

      {/* 5 · Recent results */}
      {followsTeams ? <ResultsModule results={results.results} total={results.total} /> : null}

      {/* 6 · Following summary */}
      {!followStoreBroken ? <FollowingSummary list={follow.list} /> : null}
    </div>
  );
}
