"use client";
/**
 * /following — "what have I told GameTimePicks I care about on this device?" (v1.1.2)
 *
 * NOT My GameTime. It lists follows and lets a reader remove them; it shows no scores, no games, no
 * recommendations and no personalized ordering. Those belong to later releases built on this contract.
 *
 * Names come from CURRENT published artifacts where possible (`teamLabels`), falling back to the label
 * hint stored at follow time. Identity is always the id; a name is only what we print.
 */
import Link from "next/link";
import { useState } from "react";

import FollowToggle from "./follow-toggle";
import { type FollowRef, useFollowing } from "@/lib/follow/follow-store";
import { followResearchHref } from "@/lib/research-pages/follow-links.mjs";

const MONO = "var(--font-mono)";

const SECTIONS: Array<{ key: string; title: string; filter: { sport: "MLB" | "NFL"; entityType: "team" | "player" } }> = [
  { key: "mlb-teams", title: "MLB teams", filter: { sport: "MLB", entityType: "team" } },
  { key: "nfl-teams", title: "NFL teams", filter: { sport: "NFL", entityType: "team" } },
  { key: "nfl-players", title: "NFL players", filter: { sport: "NFL", entityType: "player" } },
];

export default function FollowingManager({
  legacyMap,
  teamLabels,
  researchMap = {},
}: {
  legacyMap: Record<string, FollowRef>;
  teamLabels: Record<string, string>;
  /** v1.3: compact map of followable ids that have a research page (lib/research-pages/follow-links.mjs). */
  researchMap?: Record<string, Record<string, string>>;
}) {
  const f = useFollowing({ legacyMap });
  const [confirming, setConfirming] = useState(false);

  if (!f.ready) {
    // Neutral, same-shape placeholder: the page never flashes an empty state at someone who follows teams.
    return <p style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-text-faint)" }}>Reading this device…</p>;
  }

  if (f.status === "UNAVAILABLE") {
    return (
      <p role="status" style={{ fontSize: 13, color: "var(--vault-text-mute)", maxWidth: 620 }}>
        Following needs this browser&apos;s local storage, which is unavailable here (for example in some
        private windows). Nothing else on GameTimePicks is affected.
      </p>
    );
  }

  if (f.status === "UNSUPPORTED_VERSION") {
    // A newer version of the site saved these. We do not read or overwrite them.
    return (
      <p role="status" style={{ fontSize: 13, color: "var(--vault-text-mute)", maxWidth: 620 }}>
        Your follows were saved by a newer version of GameTimePicks, so this page is leaving them untouched.
        Reload to pick up the latest version.
      </p>
    );
  }

  const withLabel = (ref: FollowRef): FollowRef => ({ ...ref, label: teamLabels[ref.id] ?? ref.label ?? ref.id });
  const total = f.followed.length;

  if (total === 0) {
    return (
      <div style={{ maxWidth: 620 }}>
        <p style={{ fontSize: 14, color: "var(--vault-text)", margin: "0 0 8px" }}>You aren&apos;t following anything yet.</p>
        <p style={{ fontSize: 13, color: "var(--vault-text-mute)", lineHeight: 1.6, margin: "0 0 14px" }}>
          Follow teams and supported players to personalize GameTimePicks on this device. Look for Follow on a
          game page.
        </p>
        <nav aria-label="Places to follow from" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[["/live", "Live"], ["/mlb", "MLB"], ["/nfl", "NFL"]].map(([href, label]) => (
            <Link key={href} href={href} style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-gold-bright)", minHeight: 44, display: "inline-flex", alignItems: "center" }}>
              {label} →
            </Link>
          ))}
        </nav>
        {f.unresolvedLegacy > 0 ? (
          <p style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)", marginTop: 14 }}>
            {f.unresolvedLegacy} older follow{f.unresolvedLegacy === 1 ? "" : "s"} could not be matched to a current team and
            {f.unresolvedLegacy === 1 ? " was" : " were"} left as saved.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <p style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)", margin: "0 0 18px" }}>
        Following {total} · saved on this device
      </p>

      {SECTIONS.map((section) => {
        const rows = f.list(section.filter).map(withLabel);
        if (rows.length === 0) return null;
        return (
          <section key={section.key} aria-labelledby={`h-${section.key}`} style={{ marginBottom: 22 }}>
            <h2 id={`h-${section.key}`} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--vault-text-faint)", fontWeight: 400, margin: "0 0 8px" }}>
              {section.title} · {rows.length}
            </h2>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {rows.map((ref) => (
                <li key={ref.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "6px 0", borderTop: "1px solid var(--vault-border)" }}>
                  {followResearchHref(researchMap, ref.id) ? (
                    /* v1.3: the label opens the research page; Unfollow stays its own control. */
                    <Link href={followResearchHref(researchMap, ref.id)!} style={{ fontSize: 14, color: "var(--vault-text)", textDecoration: "underline", textDecorationColor: "var(--vault-border-strong)", textUnderlineOffset: 3, minHeight: 44, display: "inline-flex", alignItems: "center" }}>{ref.label}</Link>
                  ) : (
                    <span style={{ fontSize: 14, color: "var(--vault-text)" }}>{ref.label}</span>
                  )}
                  <FollowToggle entity={ref} variant="labeled" />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {f.unresolvedLegacy > 0 ? (
        <p style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)", margin: "0 0 14px" }}>
          {f.unresolvedLegacy} older follow{f.unresolvedLegacy === 1 ? "" : "s"} could not be matched to a current team and
          {f.unresolvedLegacy === 1 ? " was" : " were"} left as saved.
        </p>
      ) : null}

      {/* Bulk and destructive, so it takes two deliberate steps — inline, keyboard-reachable, no modal. */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!f.writable}
            style={{ minHeight: 44, padding: "0 14px", borderRadius: 999, border: "1px solid var(--vault-border)", background: "transparent", color: "var(--vault-text-mute)", fontFamily: MONO, fontSize: 11, cursor: "pointer" }}
          >
            Clear all
          </button>
        ) : (
          <>
            <span role="alert" style={{ fontSize: 13, color: "var(--vault-text)" }}>
              Stop following all {total} on this device?
            </span>
            <button
              type="button"
              onClick={() => { f.clear(); setConfirming(false); }}
              style={{ minHeight: 44, padding: "0 14px", borderRadius: 999, border: "1px solid var(--vault-warn)", background: "transparent", color: "var(--vault-warn)", fontFamily: MONO, fontSize: 11, cursor: "pointer" }}
            >
              Yes, clear all
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              autoFocus
              style={{ minHeight: 44, padding: "0 14px", borderRadius: 999, border: "1px solid var(--vault-border)", background: "transparent", color: "var(--vault-text-mute)", fontFamily: MONO, fontSize: 11, cursor: "pointer" }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
