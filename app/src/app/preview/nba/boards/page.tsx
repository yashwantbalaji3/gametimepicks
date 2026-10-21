/**
 * /preview/nba/boards — INTERNAL. NBA Top 10 player boards (points · rebounds · assists · 3PM · PRA · P+R · P+A; R+A is
 * shown as not modelled), PRIVATE preview. A table over every frozen row (row view model, top-board-rows.mjs) with
 * the price columns explicitly "No authorized NBA price", then the per-freeze cards.
 *
 * Internal by construction, exactly like every other /preview route: guardInternalRoute() 404s it in the production
 * export, prune-internal-routes.mjs deletes out/preview/ (HTML, RSC payload and page chunk), and it is visible only in
 * a build with NEXT_PUBLIC_INTERNAL_ROUTES=1. NBA stays HISTORICAL_ONLY; the preregistration (§6–§8) allows no public
 * NBA forecast until the forward-shadow bars are met. Guarded by lib/sports/nba/top-board-route-gating.test.mjs.
 *
 * Data, at build time: the latest frozen board file (data/internal/research/nba/top-boards/v0.1/<date>.json) when one
 * exists; otherwise the latest committed v0.1 forecast REPLAYED through the same freeze at the instant its last game
 * forecast was written (labelled as a replay — it is not a board that was frozen before tip).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import TopBoard, { type TopBoardEdition, type TopBoardMeta } from "@/components/nba/top-board";
import TopBoardTable, { type BoardTableModelT } from "@/components/nba/top-board-table";
import { guardInternalRoute } from "@/lib/internal-route-guard";
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { BOARD_MAX_ROWS, DEFAULT_BOARD_FAMILY, ELIGIBILITY, freezeBoards } from "@/lib/sports/nba/top-boards.mjs";
import { boardTableModel } from "@/lib/sports/nba/top-board-rows.mjs";

export const metadata = withRouteMetadata("/preview/nba/boards/", {
  title: "Internal Preview · NBA Top Boards (private)",
  robots: { index: false, follow: false },
});

const NBA_DIR = path.resolve(process.cwd(), "..", "data/internal/research/nba");
const BOARDS_DIR = path.join(NBA_DIR, "top-boards", DEFAULT_BOARD_FAMILY);
const FORECAST_DIR = path.join(NBA_DIR, "experimental-v0.1", "forecasts");
const datedFiles = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : []);

type Loaded = { origin: "FROZEN" | "REPLAY" | "NONE"; doc: any | null; note: string };

function loadBoards(): Loaded {
  const frozen = datedFiles(BOARDS_DIR).at(-1);
  if (frozen) return { origin: "FROZEN", doc: JSON.parse(fs.readFileSync(path.join(BOARDS_DIR, frozen), "utf8")), note: `Frozen board file ${frozen}.` };
  const latest = datedFiles(FORECAST_DIR).at(-1);
  if (!latest) return { origin: "NONE", doc: null, note: "No committed v0.1 forecast exists." };
  const bytes = fs.readFileSync(path.join(FORECAST_DIR, latest));
  const artifact = JSON.parse(bytes.toString("utf8"));
  const instants = (artifact.games ?? []).map((g: any) => g?.receipt?.generatedAt ?? artifact.generatedAt).filter(Boolean).sort();
  const frozenAt = instants.at(-1) ?? artifact.generatedAt;
  const r = freezeBoards({
    existing: null, artifact, sourceSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    sourcePath: `data/internal/research/nba/experimental-v0.1/forecasts/${latest}`, frozenAt, family: DEFAULT_BOARD_FAMILY, date: artifact.date ?? latest.slice(0, 10),
  });
  if (!r.ok || !r.doc) return { origin: "NONE", doc: null, note: r.ok ? (r.note ?? "nothing to show") : r.errors.join("; ") };
  return { origin: "REPLAY", doc: r.doc, note: `No frozen board file is committed yet. Replayed from the committed forecast ${latest} at the instant its last game forecast was written — a replay, not a board frozen before tip.` };
}

const MONO = "var(--font-mono)";

export default function NbaBoardsPreviewPage() {
  guardInternalRoute();
  const { origin, doc, note } = loadBoards();
  const meta: TopBoardMeta | null = doc ? {
    date: doc.date, family: doc.family, modelVersion: doc.modelVersion ?? null,
    minExpectedMinutes: ELIGIBILITY.minExpectedMinutes, maxMinutesCv: ELIGIBILITY.maxMinutesCv, minPlayRate: ELIGIBILITY.minPlayRate, maxRows: BOARD_MAX_ROWS,
  } : null;
  const editions: TopBoardEdition[] = doc ? [...doc.editions].reverse() : [];
  // No price object exists for any row (no authorized NBA price), so no evaluation is passed: every price cell is
  // NO_AUTHORIZED_PRICE. Wiring prices is boardRowEvaluation (top-board-evaluation.mjs) → `evaluations` here.
  const table = doc ? (boardTableModel(doc) as BoardTableModelT) : null;

  return (
    <div className="mx-auto px-4 py-10" style={{ maxWidth: 960, width: "100%", boxSizing: "border-box" }}>
      <div role="note" style={{ border: "2px solid var(--vault-warn)", background: "var(--vault-warn-dim)", borderRadius: 12, padding: "12px 14px", marginBottom: 18 }}>
        <p style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-warn)", margin: 0, fontWeight: 700 }}>
          PRIVATE PREVIEW — shadow model, not validated, not published
        </p>
        <p style={{ fontSize: 13, color: "var(--vault-text-mute)", margin: "6px 0 0", lineHeight: 1.55 }}>
          NBA forecasts are not public. This page exists only in internal builds and is removed from the public site.
        </p>
      </div>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--vault-text)", margin: "0 0 6px" }}>NBA Top Boards</h1>
      <p style={{ fontSize: 13, color: "var(--vault-text-mute)", margin: "0 0 18px", lineHeight: 1.55 }}>
        {meta ? `ET date ${meta.date} · ${meta.modelVersion ?? meta.family}. ` : ""}{note}
        {origin === "FROZEN" && editions.length > 1 ? ` ${editions.length} freezes on this date; latest first.` : ""}
      </p>
      <h2 style={{ fontSize: 18, color: "var(--vault-text)", margin: "0 0 10px" }}>All markets</h2>
      <TopBoardTable model={table} />
      <h2 style={{ fontSize: 18, color: "var(--vault-text)", margin: "24px 0 10px" }}>Boards by freeze</h2>
      {meta && editions.length ? editions.map((e) => (
        <div key={e.edition} style={{ marginBottom: 28 }}>
          {editions.length > 1 ? <h2 style={{ fontSize: 16, color: "var(--vault-text)", margin: "0 0 8px" }}>Freeze {e.edition} · {e.gamesOnBoard} game{e.gamesOnBoard === 1 ? "" : "s"}</h2> : null}
          <TopBoard edition={e} meta={meta} />
        </div>
      )) : (
        <div role="status" style={{ border: "1px dashed var(--vault-border-strong)", borderRadius: 12, padding: 18, color: "var(--vault-text-mute)" }}>No board to show: {note}</div>
      )}
    </div>
  );
}
