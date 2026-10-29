/**
 * ONE BOUT, ONE URL (P251 · F3).
 *
 * UFC was the only live sport with no per-event route. Every "View report" on the hub was an
 * anchor to a row further down the same page, so a bout could not be shared, bookmarked, linked
 * to from a ranked panel, or indexed — and this is the sport whose model is the best evidenced on
 * the site: three heads, all PASS on preregistered bars, measured over 3,557 held-out fights.
 *
 * The card artifact is already the whole read. This is the lookup that lets a route address one
 * bout inside it, and the static-params list the export needs.
 */
import fs from "node:fs";
import path from "node:path";

import type { UfcBout, UfcCardArtifact } from "@/components/sports/ufc-card";
import { readForecastLedger, type LedgerRow } from "@/lib/results/v2/forecast-ledger-reader";
import { boutKey, foldName } from "./model-vs-market.mjs";
import { looselySameFighter } from "./fighter-alias.mjs";

export function loadUfcCard(): UfcCardArtifact | null {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "public", "data", "ufc", "card-latest.json"), "utf8"),
    ) as UfcCardArtifact;
  } catch {
    return null;
  }
}

export interface UfcBoutContext {
  card: UfcCardArtifact;
  bout: UfcBout;
  /** Position on the card, 0 = main event — the hub's own ordering, never re-sorted here. */
  index: number;
  /** Every other bout on the same card, in card order, for the sibling strip. */
  siblings: UfcBout[];
}

export function findUfcBout(boutId: string): UfcBoutContext | null {
  const card = loadUfcCard();
  const bouts = card?.bouts ?? [];
  const index = bouts.findIndex((b) => String(b.boutId) === String(boutId));
  if (!card || index < 0) return null;
  return { card, bout: bouts[index], index, siblings: bouts.filter((_, i) => i !== index) };
}

/** Every bout the current card carries — including the ones the model refuses to read. */
export function ufcCardBoutIds(): string[] {
  return (loadUfcCard()?.bouts ?? []).map((b) => String(b.boutId));
}

/**
 * Every bout with a page: the current card's bouts first (card order), then every SETTLED bout in the forecast ledger
 * that is not on the current card. Before Batch 1 #3 this was the current card alone, so every bout page 404'd the
 * moment the next card was published (UFC 333's 401911632 among them).
 */
export function ufcBoutIds(): string[] {
  const card = ufcCardBoutIds();
  const onCard = new Set(card);
  return [...card, ...ufcSettledBouts().map((b) => b.boutId).filter((id) => !onCard.has(id))];
}

/* ─────────────────────────────── SETTLED BOUTS (Batch 1 · fix #3, 2026-10-29) ───────────────────────────────
 *
 * A settled bout's page is built from two committed records and nothing else:
 *
 *   · the FORECAST LEDGER (data/internal/forecast-ledger/v1/ufc.jsonl, family ufc_winner) — the winner read exactly
 *     as it was frozen in the pre-fight snapshot (pick, probability, the market's price beside it, published-at),
 *     plus its canonical settlement (the official winner, or VOID with its reason);
 *   · the RESULTS CORPUS (public/data/ufc/results-latest.json) — the method, round and time the official record
 *     carries, shown ONLY when the corpus names the same winner (or the same no-winner outcome) the ledger settled.
 *     A bout the corpus cannot be joined to, or that disagrees, shows the ledger's winner and no method or round.
 *
 * The ledger freezes the WINNER head only. The method and round reads the card published alongside it were never
 * frozen, so a settled page does not reprint them — re-running the model to fill them in would be a recomputed
 * forecast presented as the published one.
 */

/** The official method/round/time, as the results corpus records it. */
export interface UfcOfficialFinish {
  /** "ko_tko" | "submission" | "decision" | "other" — the corpus's own vocabulary. */
  method: string | null;
  round: number | null;
  time: string | null;
  /** "final" | "draw" | "no_contest". */
  resultStatus: string;
  eventDate: string;
}

export interface UfcSettledBout {
  boutId: string;
  forecastId: string;
  matchup: string;
  competition: string | null;
  /** The card's start instant as the pre-fight receipt recorded it (ledger eventStart, else its recovered value). */
  cardStartUtc: string | null;
  publishedAt: string | null;
  modelId: string | null;
  receiptId: string | null;
  /** The frozen read: the model's side and its probability. Never recomputed. */
  pick: string | null;
  probability: number | null;
  /** The de-vigged market probability of the same side, captured with the read. */
  marketProbability: number | null;
  marketProvider: string | null;
  state: "SETTLED" | "VOID";
  /** The ledger's canonical official winner (null when VOID). */
  winner: string | null;
  voidReason: string | null;
  settledAt: string | null;
  /** WIN / LOSS of the published pick, as the ledger graded it; null for a void. */
  directionalResult: "WIN" | "LOSS" | null;
  finish: UfcOfficialFinish | null;
}

const ledgerStart = (r: LedgerRow): string | null =>
  r.eventStart ?? r.provenance?.recovered?.eventStart?.value ?? null;

/** The card's own date candidates: the receipt's UTC date, and the day before (a card that starts after 00:00Z). */
function dateCandidates(startUtc: string | null): string[] {
  const d = String(startUtc ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return [];
  const prev = new Date(Date.parse(`${d}T00:00:00Z`) - 864e5).toISOString().slice(0, 10);
  return [d, prev];
}

const sides = (matchup: string): [string, string] | null => {
  const parts = String(matchup ?? "").split(" vs ");
  return parts.length === 2 && parts[0] && parts[1] ? [parts[0], parts[1]] : null;
};

interface CorpusRow { eventDate: string; fighterA: string; fighterB: string; winner: string | null; resultStatus: string; method: string | null; round: number | null; time: string | null }

let corpusCache: { byKey: Map<string, CorpusRow>; byDate: Map<string, CorpusRow[]> } | null = null;
function corpus() {
  if (corpusCache) return corpusCache;
  const byKey = new Map<string, CorpusRow>();
  const byDate = new Map<string, CorpusRow[]>();
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "ufc", "results-latest.json"), "utf8"));
    for (const r of (doc?.results ?? []) as CorpusRow[]) {
      if (!r?.eventDate || !r.fighterA || !r.fighterB) continue;
      byKey.set(boutKey(r.eventDate, r.fighterA, r.fighterB), r);
      const a = byDate.get(r.eventDate) ?? [];
      a.push(r);
      byDate.set(r.eventDate, a);
    }
  } catch { /* no corpus → no method/round on any settled page; the ledger winner still renders */ }
  corpusCache = { byKey, byDate };
  return corpusCache;
}

const same = (x: string | null | undefined, y: string | null | undefined) =>
  !!x && !!y && (foldName(x) === foldName(y) || looselySameFighter(foldName(x), foldName(y)));

/**
 * The corpus row for this ledger bout: the exact folded key first; otherwise the ONE row on the same date whose two
 * fighters both loosely match (the alias rules the odds join uses). Ambiguity returns null.
 */
function corpusRowFor(matchup: string, startUtc: string | null): CorpusRow | null {
  const s = sides(matchup);
  if (!s) return null;
  const { byKey, byDate } = corpus();
  const dates = dateCandidates(startUtc);
  for (const d of dates) {
    const hit = byKey.get(boutKey(d, s[0], s[1]));
    if (hit) return hit;
  }
  for (const d of dates) {
    const cands = (byDate.get(d) ?? []).filter((r) =>
      (same(r.fighterA, s[0]) && same(r.fighterB, s[1])) || (same(r.fighterA, s[1]) && same(r.fighterB, s[0])));
    if (cands.length === 1) return cands[0];
    if (cands.length > 1) return null;
  }
  return null;
}

/** The corpus finish, ONLY when it agrees with the ledger's settlement. */
function agreedFinish(state: "SETTLED" | "VOID", winner: string | null, row: CorpusRow | null): UfcOfficialFinish | null {
  if (!row) return null;
  const agrees = state === "VOID"
    ? (row.resultStatus === "draw" || row.resultStatus === "no_contest") && !row.winner
    : row.resultStatus === "final" && same(row.winner, winner);
  if (!agrees) return null;
  return {
    method: row.method ?? null,
    round: Number.isFinite(row.round) ? (row.round as number) : null,
    time: row.time ?? null,
    resultStatus: row.resultStatus,
    eventDate: row.eventDate,
  };
}

let settledCache: UfcSettledBout[] | null = null;
/** Every settled (or void) UFC bout in the forecast ledger, newest card first. */
export function ufcSettledBouts(): UfcSettledBout[] {
  if (settledCache) return settledCache;
  const out: UfcSettledBout[] = [];
  const seen = new Set<string>();
  for (const r of readForecastLedger().rows) {
    if (r.sport !== "UFC" || r.family !== "ufc_winner" || !r.eventId) continue;
    const state = r.settlement?.state;
    if (state !== "SETTLED" && state !== "VOID") continue;
    const id = String(r.eventId);
    if (seen.has(id)) continue; // one page per bout; the ledger holds one winner row per bout
    seen.add(id);
    const start = ledgerStart(r);
    const winner = state === "SETTLED" ? (r.settlement?.finalCategory ?? null) : null;
    const dr = r.measurement?.directionalResult;
    out.push({
      boutId: id,
      forecastId: String(r.forecastId),
      matchup: String(r.matchup ?? r.subjectDisplay ?? ""),
      competition: r.competition ?? null,
      cardStartUtc: start,
      publishedAt: r.publishedAt ?? null,
      modelId: r.modelId ?? null,
      receiptId: r.receiptId ?? null,
      pick: r.categoryPrediction ?? null,
      probability: Number.isFinite(r.probability) ? r.probability : null,
      marketProbability: Number.isFinite(r.market?.impliedProbability) ? r.market.impliedProbability : null,
      marketProvider: r.market?.provider ?? null,
      state,
      winner,
      voidReason: state === "VOID" ? (r.settlement?.reason ?? null) : null,
      settledAt: r.settlement?.settledAt ?? null,
      directionalResult: dr === "WIN" || dr === "LOSS" ? dr : null,
      finish: agreedFinish(state, winner, corpusRowFor(String(r.matchup ?? ""), start)),
    });
  }
  out.sort((a, b) => String(b.cardStartUtc ?? "").localeCompare(String(a.cardStartUtc ?? "")) || (a.boutId < b.boutId ? -1 : 1));
  settledCache = out;
  return out;
}

export interface UfcSettledContext {
  bout: UfcSettledBout;
  /** The other settled bouts from the same card (same event name and start), in ledger order. */
  siblings: UfcSettledBout[];
}

/** A settled bout's page context — null when the ledger has no settled row for it. */
export function findUfcSettledBout(boutId: string): UfcSettledContext | null {
  const all = ufcSettledBouts();
  const bout = all.find((b) => b.boutId === String(boutId));
  if (!bout) return null;
  const siblings = all.filter((b) => b.boutId !== bout.boutId && b.competition === bout.competition && b.cardStartUtc === bout.cardStartUtc);
  return { bout, siblings };
}

/**
 * The bout page for a graded-pick row's folded key (`YYYY-MM-DD:fighter|fighter`, the key /results/picks/ufc rows
 * carry), so the record can link each settled bout to its page. Built from the ledger's own matchup and card date;
 * a key that maps to no settled bout gets no link.
 */
export function ufcSettledBoutHrefByKey(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const b of ufcSettledBouts()) {
    const s = sides(b.matchup);
    if (!s) continue;
    for (const d of dateCandidates(b.cardStartUtc)) {
      const k = boutKey(d, s[0], s[1]);
      if (!(k in out)) out[k] = `/ufc/bout/${b.boutId}/`;
    }
  }
  return out;
}

/** The corpus method words, as a reader says them. */
export const UFC_FINISH_LABEL: Record<string, string> = {
  ko_tko: "KO / TKO",
  submission: "Submission",
  decision: "Decision",
  other: "Other",
};

/** "Main event" / "Co-main event" / "Bout 3 of 13" — the card's own vocabulary for position. */
export function boutPositionLabel(index: number, total: number): string {
  if (index === 0) return "Main event";
  if (index === 1) return "Co-main event";
  return `Bout ${index + 1} of ${total}`;
}
