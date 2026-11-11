/**
 * NFL QB RESULTS — the settled-game record on the QB Trends panel and the NFL game page (checklist item ledger, "results
 * on the QB/Trends panel", 2026-11-11). SERVER ONLY (the loader reads committed files at build time). Gated OFF with
 * GTP_NFL_TRENDS_PUBLIC: no page imports this outside that flag's branch.
 *
 * Per settled game and projected QB, three facts, each from its owner and never recomputed here:
 *   MODEL PROJECTION (frozen pregame)  the game's QB receipt of record (#1302: latest receipt generated before kickoff,
 *                                      projected QB = largest pass-attempt median) — the median per market
 *   FINAL · settled                    the QB's actual line (player-events box score) once the official stats say FINAL
 *   grade row                          the QB-game's row in #1302's ledger (data/internal/research/nfl/qb-props/ledger.json)
 *                                      once the grader has written it: "graded" and its window — never a score, a
 *                                      comparison or a verdict word before the single look (pre-registration v1.3)
 * under a GRADED-AGAINST line (#1314 gradedAgainstFor: the served revision and its served proof). A HOLD game shows
 * "not graded: served version not verified" and never a grade. Each market's status is visible as "under forward
 * evaluation · n/300" (n = the confirmatory paired n); a verdict appears only after the look (lookTaken).
 */
import fs from "node:fs";
import path from "node:path";

import { QB_FAMILIES, MIN_PAIRED_N, projectedQbs, receiptsOfRecord, rowWindow } from "@/lib/sports/nfl/qb-props-grade.mjs";
import { MARKET_STATUS, QB_MARKETS, QB_MARKET_STATUS } from "@/lib/sports/nfl/qb-props-markets.mjs";

export const QB_RESULT_LABELS = Object.freeze({
  projection: "MODEL PROJECTION (frozen pregame)",
  final: "FINAL · settled",
  hold: "not graded: served version not verified",
  awaitingFinal: "final not recorded yet",
  notGraded: "not graded yet",
});
const STATUS_WORDS: Record<string, string> = {
  [MARKET_STATUS.IMPLEMENTED_EXPERIMENTAL]: "experimental",
  [MARKET_STATUS.FORWARD_EVALUATION]: "under forward evaluation",
  [MARKET_STATUS.VALIDATED_OFFICIAL]: "validated",
};
const WINDOW_WORDS: Record<string, string> = {
  CONFIRMATORY: "confirmatory row",
  EXPLORATORY_SEEN_WEEKS_5_9: "exploratory row (weeks 5–9, seen)",
  EXPLORATORY: "exploratory row",
};

type Quant = { p50?: number };
type ReceiptRow = { playerId: string; name?: string | null; team: string; stats?: Record<string, Quant> };
export type QbReceipt = { eventId: string | number; eventStart: string; generatedAt: string; home: { abbr: string }; away: { abbr: string }; playerStatDistributions?: ReceiptRow[] };
export type QbBoxGame = { providerEventId: string | number; players?: ({ playerId: string } & Record<string, unknown>)[] };
type LedgerRow = { eventId: string; playerId: string; team: string; confirmatory?: boolean; season?: number; week?: number; window?: string; families?: Record<string, { model?: unknown } | null> };
export type QbLedger = { confirmatory?: Record<string, { pairedN?: number; lookTaken?: boolean; verdict?: string | null }>; rows?: LedgerRow[] } | null;
export type GradedAgainst = { rule: string; status: string; basis?: string; revision?: { generatedAt?: string; contentHash?: string } | null; servedProof?: Record<string, unknown> | null; hold?: { reason: string; detail?: string } | null; note?: string } | null;

export type QbMarketResult = {
  market: string; label: string;
  projection: number | null; actual: number | null;
  /** "graded" once the ledger holds this QB-game's market, else null (always null on a HOLD game) */
  grade: { state: "GRADED"; window: string } | null;
  /** "under forward evaluation · n/300" */
  status: string;
  /** only after the single look */
  verdict: string | null;
};
export type QbGameResult = {
  eventId: string; kickoffUtc: string; state: "GRADED" | "AWAITING_FINAL" | "HOLD" | "LEGACY" | "NOT_GRADED";
  gradedAgainst: string | null; holdText: string | null;
  qbs: { playerId: string; name: string; team: string; opp: string; home: boolean; projectedAt: string; final: boolean; markets: QbMarketResult[] }[];
};

const ET = (iso: string) => new Date(Date.parse(String(iso).replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"))).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";
const bare = (id: string) => String(id).replace(/^nfl-athlete-/, "");

/** The "graded against" line (#1314): which revision, and the proof it was the one served before kickoff. */
export function gradedAgainstText(g: GradedAgainst): string | null {
  if (!g || g.status === "HOLD") return null;
  if (g.rule === "LEGACY_RULE") return "graded against the latest official revision generated before kickoff (the rule for games before Nov 13, 2026)";
  if (!g.revision?.generatedAt) return null;
  const p = (g.servedProof ?? {}) as { publishedAt?: string; deploymentReadyAt?: string; deployment?: { id?: string; sha?: string } | string };
  const dep = typeof p.deployment === "string" ? p.deployment : p.deployment?.id ?? p.deployment?.sha ?? null;
  return [
    `graded against the official revision of ${ET(g.revision.generatedAt)}${g.revision.contentHash ? ` (content ${g.revision.contentHash})` : ""}`,
    g.basis === "LATE_REPLACEMENT" ? "a recorded late replacement served before kickoff" : "the frozen revision, served before kickoff",
    p.deploymentReadyAt ? `served proof: deployment${dep ? ` ${dep}` : ""} ready ${ET(p.deploymentReadyAt)}` : null,
  ].filter(Boolean).join(" · ");
}

/**
 * PURE: one settled game's QB results.
 * @param receipt     the game's QB receipt of record (frozen pregame), or null (no projection → no result)
 * @param game        the player-events game, or null
 * @param final       the official stats say FINAL
 * @param gradedAgainst  #1314's record for the game
 * @param ledger      #1302's QB ledger, or null before the grader has written one
 */
export function qbGameResult({ receipt, game, final, gradedAgainst, ledger }: { receipt: QbReceipt | null; game: QbBoxGame | null; final: boolean; gradedAgainst: GradedAgainst; ledger: QbLedger }): QbGameResult | null {
  if (!receipt) return null;
  const eventId = String(receipt.eventId);
  const hold = gradedAgainst?.status === "HOLD";
  const state: QbGameResult["state"] = hold ? "HOLD" : !final ? "AWAITING_FINAL" : gradedAgainst?.rule === "LEGACY_RULE" ? "LEGACY" : gradedAgainst?.status === "GRADED" ? "GRADED" : "NOT_GRADED";
  const progress = (family: string) => {
    const c = ledger?.confirmatory?.[family];
    return { n: Number(c?.pairedN ?? 0), verdict: c?.lookTaken ? (c.verdict ?? null) : null };
  };
  const qbs = Object.values(projectedQbs(receipt) as Record<string, ReceiptRow>).sort((a, b) => a.team.localeCompare(b.team)).map((qb) => {
    const pid = `nfl-athlete-${bare(qb.playerId)}`;
    const box = final ? game?.players?.find((p) => p.playerId === pid) ?? null : null;
    const row = !hold ? ledger?.rows?.find((r) => String(r.eventId) === eventId && r.playerId === pid) ?? null : null;
    const home = qb.team === receipt.home.abbr;
    return {
      playerId: bare(qb.playerId), name: qb.name ?? bare(qb.playerId), team: qb.team, opp: home ? receipt.away.abbr : receipt.home.abbr, home, projectedAt: receipt.generatedAt, final: Boolean(box),
      markets: QB_MARKETS.map((m: { market: string; stat: string; label: string }) => {
        const f = QB_FAMILIES.find((x: { family: string }) => x.family === m.market) as { family: string; actual: string };
        const p = Number(qb.stats?.[m.stat]?.p50);
        const a = box ? Number(box[f.actual]) : NaN;
        const { n, verdict } = progress(m.market);
        const graded = row?.families?.[m.market]?.model ? { state: "GRADED" as const, window: WINDOW_WORDS[row.window ?? rowWindow(row)] ?? "row" } : null;
        return {
          market: m.market, label: m.label, projection: Number.isFinite(p) ? p : null, actual: Number.isFinite(a) ? a : null, grade: graded,
          status: `${STATUS_WORDS[(QB_MARKET_STATUS as Record<string, string>)[m.market]] ?? (QB_MARKET_STATUS as Record<string, string>)[m.market]} · ${n}/${MIN_PAIRED_N}`,
          verdict: n >= MIN_PAIRED_N ? verdict : null,
        };
      }),
    };
  });
  return { eventId, kickoffUtc: receipt.eventStart, state, gradedAgainst: hold ? null : gradedAgainstText(gradedAgainst), holdText: hold ? QB_RESULT_LABELS.hold : null, qbs };
}

/* ── loader (build time; memoised — one read per build, however many pages ask) ───────────────────────────────── */
const REPO = () => path.resolve(process.cwd(), "..");
const readJson = (f: string) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
export const QB_LEDGER_REL = "data/internal/research/nfl/qb-props/ledger.json";
let memo: { receipts: Map<string, QbReceipt>; games: Map<string, QbBoxGame>; ledger: QbLedger } | null = null;

async function sources() {
  if (memo) return memo;
  const { readShadowReceipts } = await import("@/lib/sports/nfl/sim-v2/public-receipt.mjs");
  const root = REPO();
  const { records } = receiptsOfRecord(readShadowReceipts(root));
  const receipts = new Map(records.map((r: { receipt: QbReceipt }) => [String(r.receipt.eventId), r.receipt]));
  const dir = path.join(root, "data", "internal", "research", "nfl", "player-events-v1");
  let files: string[] = [];
  try { files = fs.readdirSync(dir).filter((f) => /^\d{4}\.json$/.test(f)).sort().slice(-1); } catch { files = []; }
  const games = new Map<string, QbBoxGame>(files.flatMap((f) => (readJson(path.join(dir, f))?.games ?? []) as QbBoxGame[]).map((g) => [String(g.providerEventId), g]));
  memo = { receipts, games, ledger: readJson(path.join(root, QB_LEDGER_REL)) };
  return memo;
}

/**
 * One settled game's QB results at build time, or null (no receipt of record, or kickoff still ahead of `nowIso`).
 * `gradedAgainstOf` is #1314's hook (served-grade-io gradedAgainstFor bound to the repo root) — passed in by the caller,
 * which imports it inside its own flag branch.
 */
export type GradedAgainstOf = (eventId: string) => GradedAgainst;
export async function loadQbGameResult(eventId: string, gradedAgainstOf: GradedAgainstOf, nowIso: string = new Date().toISOString()): Promise<QbGameResult | null> {
  const { receipts, games, ledger } = await sources();
  const receipt = receipts.get(String(eventId)) ?? null;
  if (!receipt || !(Date.parse(receipt.eventStart.replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z")) < Date.parse(nowIso))) return null;
  const official = readJson(path.join(REPO(), "data", "internal", "nfl", "official-stats", `${eventId}.json`));
  return qbGameResult({ receipt, game: games.get(String(eventId)) ?? null, final: official?.state === "FINAL", gradedAgainst: gradedAgainstOf(String(eventId)), ledger });
}

/** A QB's settled games (newest first) among `eventIds`, reduced to his own row — for the Trends panel. */
export type QbPlayerResult = { eventId: string; kickoffUtc: string; state: QbGameResult["state"]; gradedAgainst: string | null; holdText: string | null; qb: QbGameResult["qbs"][number] };
export async function loadQbResultsFor(playerId: string, eventIds: readonly string[], gradedAgainstOf: GradedAgainstOf, nowIso?: string): Promise<QbPlayerResult[]> {
  const out: QbPlayerResult[] = [];
  for (const id of eventIds) {
    const g = await loadQbGameResult(id, gradedAgainstOf, nowIso);
    const qb = g?.qbs.find((q) => q.playerId === bare(playerId));
    if (g && qb) out.push({ eventId: g.eventId, kickoffUtc: g.kickoffUtc, state: g.state, gradedAgainst: g.gradedAgainst, holdText: g.holdText, qb });
  }
  return out;
}
