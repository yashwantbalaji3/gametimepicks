/**
 * NCAAF PREVIEW hub adapter (NCAAF-008, local only). Feeds the SHARED sport-hub shell (`SportHubModel`,
 * `HubTitle` / `HubHeader`) from the private forward shadow receipts — no NCAAF-specific layout.
 *
 * Read only from internal pages (`/preview/ncaaf/…`), which `guardInternalRoute()` 404s in the production
 * export and `prune-internal-routes.mjs` deletes from `out/`. Nothing here may be wired to a public route:
 * NCAAF is not in the capability registry (unknown ⇒ DISABLED), and every number below is a SHADOW research
 * forecast, labelled as one on every row.
 *
 * Owners, never re-derived:
 *   forecasts  data/internal/research/ncaaf/forecasts/<season>/runs/<capture>.json + the receipts it lists
 *   grades     data/internal/research/ncaaf/grades/<season>/<eventId>.jsonl (append-only; last line = current)
 * A row's read is the receipt's own C1 P(home). No complement is invented for a split bar (contract.ts),
 * and no school logo is drawn: there is no approved NCAAF logo source, so participants fall back to initials.
 */
import fs from "node:fs";
import path from "node:path";

import { DEFAULT_LABELS, hubStatusWord, type HubGameRow, type SportHubModel } from "@/lib/sport-hub/contract";

const ET = "America/New_York";
export const NCAAF_SHADOW_DETAIL = "Shadow forecast · private research · not published";

/** The subset of a forecast receipt (ncaaf-forecast-receipt@1) the preview reads. */
export interface NcaafReceipt {
  capturedAt: string;
  publicationStatus: string;
  event: { eventId: string; season: number; week: number; slateDate: string; startUtcAtCapture: string; homeAbbreviation: string | null; awayAbbreviation: string | null; neutralSite: boolean | null; pairing: string };
  code: { commit: string };
  models: Record<string, { id?: string; engine?: string; status?: string }>;
  forecast: {
    winner: { pHome: number; source: string };
    score: { pHome: number; homeMean: number; awayMean: number; marginMean: number; marginSd: number; totalMean: number; totalSd: number };
    worlds: { refused?: string; pHome?: number; worlds?: number; counts?: { homeWins: number; awayWins: number; overtimeWorlds: number }; marginPercentiles?: Record<string, number>; totalPercentiles?: Record<string, number>; marginHistogram?: Record<string, number>; totalHistogram?: Record<string, number> };
  };
  market: { provider: string | null; capturedAt: string; details: string | null; homeSpread: number | null; spreadCheck: string; overUnder: number | null; homeMoneyline: number | null; awayMoneyline: number | null } | null;
}
export interface NcaafGrade {
  settlement: { state: string; finalHome: number | null; finalAway: number | null; overtimePeriods: number | null };
  forecastOfRecord: { capturedAt: string };
}

const startLabel = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: ET })} · `
    + `${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: ET })} ET`;
};
const shortDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const pct = (p: number) => `${Math.round(p * 100)}%`;

/** Pure builder: the page and the tests read the same function. */
export function ncaafPreviewHubFrom({ nowIso, capturedAt, receipts, grades }: {
  nowIso: string; capturedAt: string | null; receipts: NcaafReceipt[]; grades: Map<string, NcaafGrade>;
}): SportHubModel {
  const now = Date.parse(nowIso);
  const rows: HubGameRow[] = receipts.map((r) => {
    const e = r.event;
    const home = e.homeAbbreviation ?? "Home", away = e.awayAbbreviation ?? "Away";
    const g = grades.get(e.eventId);
    const started = Date.parse(e.startUtcAtCapture) <= now || (g != null && g.settlement.state !== "PENDING");
    const settled = g?.settlement.state === "SETTLED";
    const status = settled ? "final" : g?.settlement.state === "VOID" ? "postponed" : hubStatusWord(started ? "STARTED" : "SCHEDULED", started);
    const p = r.forecast.winner.pHome;
    const fav = p >= 0.5 ? home : away;
    return {
      id: e.eventId,
      startUtc: e.startUtcAtCapture,
      startLabel: startLabel(e.startUtcAtCapture),
      matchup: `${away} @ ${home}${e.neutralSite ? " · neutral site" : ""}`,
      status,
      started,
      read: { kind: "MODEL_FORECAST", label: `${fav} ${pct(p >= 0.5 ? p : 1 - p)} to win`, detail: NCAAF_SHADOW_DETAIL, favored: fav },
      reportState: started ? "ARCHIVE" : "READY",
      reportHref: `/preview/ncaaf/game/${e.eventId}/`,
      reportNote: settled ? `Final · ${away} ${g!.settlement.finalAway} – ${home} ${g!.settlement.finalHome}${g!.settlement.overtimePeriods ? ` (${g!.settlement.overtimePeriods}OT)` : ""}` : undefined,
      participants: [{ name: away, logoTeam: null, logoSport: null }, { name: home, logoTeam: null, logoSport: null }],
      separator: "@",
    };
  });
  rows.sort((a, b) => Date.parse(a.startUtc!) - Date.parse(b.startUtc!) || a.id.localeCompare(b.id));
  const slates = receipts.map((r) => r.event.slateDate).sort();
  const week = receipts[0]?.event.week, season = receipts[0]?.event.season;
  return {
    sport: "ncaaf",
    sportLabel: "College Football · preview",
    labels: { ...DEFAULT_LABELS },
    periodLabel: week ? `Week ${week} · ${season}` : "No captured week",
    periodRange: slates.length ? `${shortDay(slates[0])} – ${shortDay(slates.at(-1)!)}` : null,
    freshness: capturedAt,
    rows,
    present: ["games", "simulations", "results"],
    emptyReason: "No forward shadow capture exists yet.",
  };
}

const ROOT = () => path.resolve(process.cwd(), "..", "data", "internal", "research", "ncaaf");
const readJson = <T,>(f: string): T | null => { try { return JSON.parse(fs.readFileSync(f, "utf8")) as T; } catch { return null; } };

/** Every receipt of the season, grouped by event (all captures, oldest first). */
export function loadNcaafReceipts(season: number): Map<string, NcaafReceipt[]> {
  const dir = path.join(ROOT(), "forecasts", String(season));
  const out = new Map<string, NcaafReceipt[]>();
  if (!fs.existsSync(dir)) return out;
  for (const slate of fs.readdirSync(dir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()) {
    for (const id of fs.readdirSync(path.join(dir, slate)).sort()) {
      const files = fs.readdirSync(path.join(dir, slate, id)).filter((n) => n.endsWith(".json")).sort();
      out.set(id, files.map((n) => readJson<NcaafReceipt>(path.join(dir, slate, id, n))).filter((x): x is NcaafReceipt => x !== null));
    }
  }
  return out;
}

/** Current grade per event (last line of its append-only log). */
export function loadNcaafGrades(season: number): Map<string, NcaafGrade> {
  const dir = path.join(ROOT(), "grades", String(season));
  const out = new Map<string, NcaafGrade>();
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".jsonl"))) {
    const lines = fs.readFileSync(path.join(dir, f), "utf8").trim().split("\n").filter(Boolean);
    if (lines.length) out.set(f.replace(/\.jsonl$/, ""), JSON.parse(lines.at(-1)!) as NcaafGrade);
  }
  return out;
}

/** The latest run's week: its receipts (each event's latest capture) and its capture time. */
export function ncaafPreviewHub(nowIso: string, season = 2026): SportHubModel {
  const runs = path.join(ROOT(), "forecasts", String(season), "runs");
  const latest = fs.existsSync(runs) ? fs.readdirSync(runs).filter((n) => n.endsWith(".json")).sort().at(-1) : undefined;
  const run = latest ? readJson<{ capturedAt: string; week: number }>(path.join(runs, latest)) : null;
  const all = loadNcaafReceipts(season);
  const receipts = run ? [...all.values()].map((rs) => rs.at(-1)!).filter((r) => r.event.week === run.week) : [];
  return ncaafPreviewHubFrom({ nowIso, capturedAt: run?.capturedAt ?? null, receipts, grades: loadNcaafGrades(season) });
}
