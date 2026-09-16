"use client";
/**
 * "YOUR TEAMS" (P251 · F9) — the payoff for following one.
 *
 * Reads the same search index the overlay uses, so the strip can only ever offer a club that has
 * something to open right now, and the destination is the one the index derived from a published
 * artifact. A followed club with nothing on the slate is SAID rather than dropped — "no game in
 * the current window" is a real answer and hiding it would look like a bug.
 *
 * Renders nothing at all until a reader has followed something. An empty prompt on every page for
 * a feature nobody has used is noise.
 */
import { useEffect, useState } from "react";

import { type FollowRef, useFollowing } from "@/lib/follow/follow-store";

interface Row { k: number; l: string; s: string; h: string }
interface Index { kinds: string[]; rows: Row[] }

/**
 * v1.1.2: identity is the canonical id; the strip finds a DESTINATION by the ref's name against the same
 * published search index as before, disambiguated by sport so "Arizona Cardinals" and "Arizona
 * Diamondbacks" can never be confused. A stale name hint only degrades to "No game in the current
 * window" — it never follows or links the wrong club.
 */
export default function YourTeams({ legacyMap }: { legacyMap?: Record<string, FollowRef> | null } = {}) {
  const { list, ready } = useFollowing({ legacyMap });
  const teams = list({ entityType: "team" });
  const [index, setIndex] = useState<Index | null>(null);

  useEffect(() => {
    if (!ready || teams.length === 0 || index) return;
    let live = true;
    fetch("/data/search/index.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: Index) => { if (live) setIndex(j); })
      .catch(() => { if (live) setIndex({ kinds: [], rows: [] }); });
    return () => { live = false; };
  }, [ready, teams.length, index]);

  if (!ready || teams.length === 0) return null;

  const teamKind = index?.kinds.indexOf("team") ?? -1;
  const byTeam = new Map((index?.rows ?? []).filter((r) => r.k === teamKind).map((r) => [`${r.s.split(" ·")[0]}|${r.l}`, r]));

  return (
    <section aria-labelledby="your-teams" className="reveal" style={{ marginTop: 18 }}>
      <h2
        id="your-teams"
        className="font-mono uppercase tracking-[0.16em]"
        style={{ fontSize: 10, color: "var(--vault-gold)", margin: "0 0 8px", fontWeight: 400 }}
      >
        Your teams
      </h2>
      <div className="flex flex-wrap gap-2">
        {teams.map((ref) => {
          const t = ref.label ?? "Followed team";
          const row = ref.label ? byTeam.get(`${ref.sport}|${ref.label}`) : undefined;
          return row ? (
            <a
              key={ref.id}
              href={row.h}
              style={{
                display: "inline-flex", flexDirection: "column", gap: 2, textDecoration: "none",
                border: "1px solid var(--vault-border)", borderRadius: 10, padding: "8px 12px", color: "inherit",
                minWidth: 170,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--vault-text)" }}>★ {t}</span>
              <span style={{ fontSize: 11.5, color: "var(--vault-text-mute)" }}>{row.s}</span>
            </a>
          ) : (
            <span
              key={ref.id}
              style={{
                display: "inline-flex", flexDirection: "column", gap: 2,
                border: "1px dashed var(--vault-rule)", borderRadius: 10, padding: "8px 12px", minWidth: 170,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--vault-text-mute)" }}>★ {t}</span>
              <span style={{ fontSize: 11.5, color: "var(--vault-text-faint)" }}>
                {index ? "No game in the current window" : "Checking the slate…"}
              </span>
            </span>
          );
        })}
      </div>
    </section>
  );
}
