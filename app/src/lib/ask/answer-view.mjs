/**
 * ASK ANSWER VIEW (Session 3) — the pure half of the answer renderer: which renderer an answer gets, and the
 * deterministic words and labels it shows. The React half (components/ask/ask-answer.tsx) only lays these out.
 *
 * PROGRESSIVE ENHANCEMENT, NEVER A GATE. `answerRenderer` returns a typed renderer only when the display is one of the
 * known kinds AND carries the fields that renderer reads; everything else — no display, an unknown kind, a malformed
 * one — is "generic", which renders the verified text exactly as before. A typed card never replaces the verified
 * answer: the answer text is always shown, and the card adds the owner's own fields beneath it.
 *
 * LABELS ARE MAPPINGS, NOT INTERPRETATIONS. A confidence enum is re-cased ("STRONG SIMULATION" → "Strong simulation"),
 * a grade keeps its own word, a live state gets its plain name. Nothing here invents a tier, a status or a reason.
 */

import { legState } from "../results/v2/lane-words.mjs";

/** @returns {"forecasts"|"live"|"resultsDay"|"teamCompare"|"generic"} */
export function answerRenderer(display) {
  if (!display || typeof display !== "object") return "generic";
  switch (display.kind) {
    case "forecasts":
      return Array.isArray(display.games) && display.games.length && display.games.every((g) => g && typeof g.matchup === "string") ? "forecasts" : "generic";
    case "live":
      return Array.isArray(display.games) ? "live" : "generic";
    case "resultsDay":
      return typeof display.date === "string" && Array.isArray(display.sports) && Array.isArray(display.lanes) ? "resultsDay" : "generic";
    case "teamCompare":
      return typeof display.a === "string" && typeof display.b === "string" && Array.isArray(display.rows) && display.rows.length ? "teamCompare" : "generic";
    default:
      return "generic";
  }
}

/** "STRONG SIMULATION" → "Strong simulation". Case only; the owner's words are kept. */
export function enumLabel(v) {
  const s = String(v ?? "").replace(/_/g, " ").trim();
  if (!s) return null;
  return s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s;
}

/* The owner's grade words, with an accessible label and a tone. PENDING is its own state — never a loss. */
const GRADE = Object.freeze({
  WIN: { label: "Win", tone: "win" },
  LOSS: { label: "Loss", tone: "loss" },
  PUSH: { label: "Push", tone: "neutral" },
  VOID: { label: "Void", tone: "neutral" },
  PENDING: { label: "Pending", tone: "pending" },
});
export const gradeBadge = (grade) => GRADE[grade] ?? GRADE.PENDING;

/* Lane/leg results as the Results day owner words them (evidence.mjs LANE_WORD), shortened for a badge. */
const LANE = Object.freeze({
  won: { label: "Won", tone: "win" },
  lost: { label: "Lost", tone: "loss" },
  push: { label: "Push", tone: "neutral" },
  void: { label: "Void", tone: "neutral" },
  pending: { label: "Pending", tone: "pending" },
  active: { label: "Open", tone: "pending" },
  /* Session 3 · lane-words.mjs: a no-card lane, and a pending leg of a decided lane — neither is an open bet. */
  awaiting: { label: "No card", tone: "neutral" },
  "not-graded": { label: "Not graded", tone: "neutral" },
});
export const laneBadge = (result) => LANE[result] ?? LANE.pending;
/** A leg's badge in its lane's context — "pending" in a decided lane is "Not graded", never a loss. */
export const legBadge = (legResult, laneResult) => laneBadge(legState(legResult, laneResult));

/* Live states in plain words. The provider's own detail is shown beside it only when it says something new. */
const LIVE = Object.freeze({ LIVE: "Live", FINAL: "Final", PRE: "Not started" });
export function liveStateLabel(state, stateDetail) {
  const base = LIVE[state] ?? enumLabel(state) ?? "State not reported";
  const detail = String(stateDetail ?? "").trim();
  return detail && detail.toLowerCase() !== base.toLowerCase() && detail.toLowerCase() !== String(state ?? "").toLowerCase()
    ? `${base} · ${detail}`
    : base;
}

const ET_KICKOFF = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const ET_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
const ET_DAY_SHORT = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

/** A canonical UTC instant as the same instant in ET ("Wed, Sep 30, 10:00 PM ET"), or null. */
export function kickoffEt(iso) {
  const t = Date.parse(String(iso ?? ""));
  return Number.isFinite(t) ? `${ET_KICKOFF.format(new Date(t))} ET` : null;
}
/** "as of 11:04 PM ET", or null. */
export function asOfEt(iso) {
  const t = Date.parse(String(iso ?? ""));
  return Number.isFinite(t) ? `as of ${ET_TIME.format(new Date(t))} ET` : null;
}
/** An ET calendar date ("2026-09-29") as "Tuesday, September 29". The date is already ET; it is not shifted. */
export function dayLabel(ymd, { short = false } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd ?? ""))) return null;
  return (short ? ET_DAY_SHORT : ET_DAY).format(new Date(`${ymd}T12:00:00Z`));
}

/** A counted noun: (1, "matchup") → "1 matchup", (3, "matchup") → "3 matchups". */
export const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * THE ANSWER'S OTHER LINKS — de-duplicated by href, minus any href a card already shows. Three game cards that each
 * carry "Open the MLB game report" no longer leave three identical chips under the answer (the founder's duplicate).
 */
export function remainingLinks(links, display) {
  const shown = new Set();
  if (display && typeof display === "object") {
    if (display.href) shown.add(display.href);
    for (const g of display.games ?? []) if (g?.href) shown.add(g.href);
  }
  const out = [];
  for (const l of links ?? []) {
    if (!l?.href || shown.has(l.href)) continue;
    shown.add(l.href);
    out.push(l);
  }
  return out;
}

/** The "Sources" disclosure's line: friendly names, de-duplicated, with a neutral name for anything unlabelled. */
export function sourceNames(sources, labels) {
  return [...new Set((sources ?? []).map((s) => labels?.[s] ?? "GameTime"))];
}

/** "Results day" style heading for a results display, honest about which day it is. */
export function resultsHeading(display) {
  const d = dayLabel(display?.date);
  if (!d) return "Results";
  return display?.isYesterday ? `Yesterday · ${d}` : d;
}
