/**
 * SERVER-SIDE assembly of per-row research lineage.
 *
 * Kept apart from `row-lineage.ts` so the derivation stays pure and testable without touching disk.
 * This file does the reading; that file does the reasoning.
 *
 * WHAT IT JOINS
 *   ledger  public/data/mlb/results/settled_leans.jsonl    the official settled record (READ ONLY)
 *   board   public/data/mlb/boards/<date>.json             the pregame row the ledger row came from
 *   archive data/internal/mlb/pregame-archive/settlement-joins/<date>/<gamePk>.json
 *                                                          per-row capture times + the official source
 *   refusal data/internal/mlb/research-quarantine/<date>.json  rows an eligibility gate withheld
 *   terminal public/data/research/terminal-summary.json    date-level quarantines + market registry
 *
 * The ledger is never written. Nothing here modifies any input; the whole product of this module is a
 * sidecar that can be deleted and rebuilt without touching a single settled result.
 *
 * WHY THE ARCHIVE ONLY COVERS RECENT DATES
 * Per-row capture stamps began with the pregame archive. Everything before it is `LEGACY_UNSTAMPED`
 * and stays that way: the board's file-level `generatedAt` describes when the build ran, not when a
 * price was observed, and substituting one for the other would make every historical row look
 * research-eligible. That substitution is the failure `lib/identity/provenance.ts` exists to prevent.
 *
 * Server-only.
 */
import fs from "node:fs";
import path from "node:path";

import {
  OFFICIAL_SETTLEMENT_SOURCES,
  validateSettlementLineage,
  type SettlementLineage,
} from "@/lib/identity/settlement-lineage";

import { loadTerminal } from "./public-contract-adapter";
import {
  PREGAME_JOIN_METHOD,
  ROW_SCHEMA_VERSION,
  buildEventIdentityIndex,
  buildPregameObservationIndex,
  deriveRowLineage,
  resolveRowIdentity,
  summarizeCoverage,
  validateRowLineage,
  type BoardRow,
  type CoverageSummary,
  type LedgerRow,
  type PregameObservation,
  type PregameJoinSubject,
  type QuarantineNote,
  type ResearchRowLineage,
  type SettlementRecord,
} from "./row-lineage";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const BOARDS = path.join(APP, "public/data/mlb/boards");
const LEDGER = path.join(APP, "public/data/mlb/results/settled_leans.jsonl");
const ARCHIVE = path.join(REPO, "data/internal/mlb/pregame-archive/settlement-joins");
const REFUSALS = path.join(REPO, "data/internal/mlb/research-quarantine");
export const LINEAGE_ARTIFACT_DIR = path.join(APP, "public/data/research/row-lineage");

const readJson = <T>(p: string): T | null => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
};

// ── inputs ─────────────────────────────────────────────────────────────────────────────────────

let ledgerCache: Map<string, LedgerRow[]> | null = null;

/** Ledger rows grouped by the date the ledger itself records, which is authoritative for settlement. */
export function ledgerByDate(): Map<string, LedgerRow[]> {
  if (ledgerCache) return ledgerCache;
  const out = new Map<string, LedgerRow[]>();
  if (fs.existsSync(LEDGER)) {
    for (const line of fs.readFileSync(LEDGER, "utf8").split("\n")) {
      if (!line.trim()) continue;
      let r: LedgerRow;
      try {
        r = JSON.parse(line) as LedgerRow;
      } catch {
        continue;
      }
      if (!r.date || !r.id) continue;
      out.set(r.date, [...(out.get(r.date) ?? []), r]);
    }
  }
  ledgerCache = out;
  return out;
}

/** Every slate date with a committed board, newest first. */
export function boardDates(): string[] {
  if (!fs.existsSync(BOARDS)) return [];
  return fs
    .readdirSync(BOARDS)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 10))
    .sort()
    .reverse();
}

/** Dates for which a pregame archive exists — the only dates row-level lineage can be proven for. */
export function archiveDates(): string[] {
  if (!fs.existsSync(ARCHIVE)) return [];
  return fs
    .readdirSync(ARCHIVE)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
    .reverse();
}

export interface LineageContext {
  /** Slates an integrity gate refused outright. Every row on them is QUARANTINED. */
  readonly quarantinedDates: ReadonlySet<string>;
  readonly quarantineReason: ReadonlyMap<string, string>;
  /** Market-registry status from the public contract. Read, never recomputed. */
  readonly registryStatus: ReadonlyMap<string, string>;
  readonly calibrationVersion: string | null;
  readonly asOfSettledDate: string | null;
}

export function loadLineageContext(): LineageContext {
  const terminal = loadTerminal();
  const quarantinedDates = new Set<string>();
  const quarantineReason = new Map<string, string>();
  for (const q of terminal.quarantines) {
    if (!q.date) continue;
    quarantinedDates.add(q.date);
    quarantineReason.set(q.date, q.publicExplanation);
  }
  return {
    quarantinedDates,
    quarantineReason,
    registryStatus: new Map((terminal.registry?.markets ?? []).map((m) => [m.market, m.status])),
    calibrationVersion: terminal.calibration?.version ?? null,
    asOfSettledDate: terminal.asOfSettledDate,
  };
}

// ── the pregame archive ────────────────────────────────────────────────────────────────────────

interface ArchiveMarketRow {
  market: string;
  gamePk: number;
  providerEventId: string | null;
  playerId: number | null;
  player: string | null;
  selection: string | null;
  line: number | null;
  noVigProbability: number | null;
  capturedAt: string | null;
  availableAt?: string | null;
  matchBy?: string | null;
}

interface ArchiveFile {
  date: string;
  gamePk: number;
  providerEventId: string | null;
  eventStartTime: string | null;
  sourceSnapshotIds?: string[];
  officialSource?: { source?: string; endpoint?: string; sourceType?: string; fetchedAt?: string };
  marketRows?: ArchiveMarketRow[];
}

/** Map the archive's own source descriptor onto an entry from the official-settlement allowlist. */
function officialSourceType(file: ArchiveFile): string | null {
  const endpoint = file.officialSource?.endpoint ?? "";
  if (endpoint.includes("statsapi.mlb.com")) return "mlb-statsapi-boxscore";
  const declared = file.officialSource?.sourceType ?? "";
  return OFFICIAL_SETTLEMENT_SOURCES.includes(declared) ? declared : null;
}

export interface ArchiveIndex {
  readonly observations: ReturnType<typeof buildPregameObservationIndex>;
  readonly settlementByGamePk: ReadonlyMap<string, SettlementRecord>;
  readonly eventStartByGamePk: ReadonlyMap<string, string | null>;
  readonly providerEventByGamePk: ReadonlyMap<string, string | null>;
  readonly files: number;
}

/**
 * Index one date's pregame archive.
 *
 * The capture times come from `marketRows[].capturedAt`, which the archive copied from the market
 * snapshot it was built from; `sourceSnapshotIds` is carried through so a reader can go back to that
 * snapshot. The settlement side is read from the same file's `officialSource` and kept in a separate
 * map, so pregame timing and postgame knowledge never travel together through this module.
 */
export function loadArchiveIndex(date: string): ArchiveIndex {
  const dir = path.join(ARCHIVE, date);
  const entries: [PregameJoinSubject, PregameObservation][] = [];
  const settlementByGamePk = new Map<string, SettlementRecord>();
  const eventStartByGamePk = new Map<string, string | null>();
  const providerEventByGamePk = new Map<string, string | null>();
  let files = 0;

  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
      const file = readJson<ArchiveFile>(path.join(dir, name));
      if (!file) continue;
      files += 1;
      const rel = `data/internal/mlb/pregame-archive/settlement-joins/${date}/${name}`;
      const snapshotRef = file.sourceSnapshotIds?.[0] ?? null;
      const gamePk = String(file.gamePk);
      eventStartByGamePk.set(gamePk, file.eventStartTime ?? null);
      providerEventByGamePk.set(gamePk, file.providerEventId ?? null);
      settlementByGamePk.set(gamePk, {
        outcome: null,
        sourceRef: file.officialSource?.endpoint ?? null,
        sourceType: officialSourceType(file),
        gradedAgainstId: file.gamePk,
        finalizedAt: file.officialSource?.fetchedAt ?? null,
      });

      for (const row of file.marketRows ?? []) {
        entries.push([
          {
            gamePk: row.gamePk,
            marketKey: row.market,
            playerId: row.playerId,
            playerName: row.player,
            line: row.line,
            side: row.selection,
          },
          {
            capturedAt: row.capturedAt ?? null,
            availableAt: row.availableAt ?? null,
            eventStart: file.eventStartTime ?? null,
            sourceRef: rel,
            sourceKind: "mlb-pregame-settlement-join",
            joinMethod: PREGAME_JOIN_METHOD,
            snapshotRef,
            noVigProbability: typeof row.noVigProbability === "number" ? row.noVigProbability : null,
          },
        ]);
      }
    }
  }

  return {
    observations: buildPregameObservationIndex(entries),
    settlementByGamePk,
    eventStartByGamePk,
    providerEventByGamePk,
    files,
  };
}

// ── row-level refusals ─────────────────────────────────────────────────────────────────────────

interface RefusalRow {
  observationId: string;
  gamePk: number;
  market: string;
  line: number | null;
  exclusionReason: string;
  reasonDetail?: string;
}

/**
 * Rows an eligibility gate withheld, keyed the way the quarantine artifact keys them.
 *
 * The artifact's `observationId` is `date:gamePk:market:playerId:line` for player markets, so the key
 * is rebuilt the same way rather than matched on anything looser. A refusal that fails to match is a
 * refusal that silently stops applying.
 */
export function loadRowRefusals(date: string): ReadonlyMap<string, QuarantineNote> {
  const out = new Map<string, QuarantineNote>();
  const p = path.join(REFUSALS, `${date}.json`);
  const file = readJson<{ rows?: RefusalRow[] }>(p);
  if (!file?.rows) return out;
  const rel = `data/internal/mlb/research-quarantine/${date}.json`;
  for (const r of file.rows) {
    if (!r.observationId) continue;
    out.set(r.observationId, {
      scope: "row",
      reason: r.reasonDetail ?? r.exclusionReason ?? "withheld by a research-eligibility gate",
      sourceRef: rel,
    });
  }
  return out;
}

/** The refusal key for a board row, matching the quarantine artifact's `observationId` construction. */
export function refusalKey(date: string, board: BoardRow): string | null {
  if (board.playerId == null) return null;
  return `${date}:${board.gamePk}:${board.marketKey}:${board.playerId}:${board.line ?? ""}`;
}

// ── assembly ───────────────────────────────────────────────────────────────────────────────────

export interface DateLineage {
  readonly date: string;
  readonly rows: readonly ResearchRowLineage[];
  readonly coverage: CoverageSummary;
  /** Envelope-level guard violations. A non-empty list must block publication. */
  readonly violations: readonly string[];
  /** True when a pregame archive exists for this date, i.e. row-level proof is even possible. */
  readonly archivePresent: boolean;
}

/**
 * Build every envelope for one slate.
 *
 * Starts from the BOARD, not the ledger: rows that were generated and never graded are absent from the
 * ledger entirely (Sprint 046), and enumerating the ledger would quietly report a smaller universe
 * whose missing rows read as if they never existed.
 */
export function buildDateLineage(date: string, ctx: LineageContext): DateLineage {
  const board = readJson<{ games?: Record<string, unknown>[]; leans?: Record<string, unknown>[]; generatedAt?: string }>(
    path.join(BOARDS, `${date}.json`),
  );
  if (!board) {
    return {
      date,
      rows: [],
      coverage: summarizeCoverage([]),
      violations: [`board for ${date} is missing or unreadable`],
      archivePresent: false,
    };
  }

  const identityIndex = buildEventIdentityIndex(board.games ?? [], board.generatedAt ?? `${date}T00:00:00Z`);
  const archive = loadArchiveIndex(date);
  const refusals = loadRowRefusals(date);
  const settledById = new Map((ledgerByDate().get(date) ?? []).map((r) => [r.id, r]));
  const dateQuarantined = ctx.quarantinedDates.has(date);

  // The gate can only run where the chain is actually present. Rows with no archive coverage are
  // reported as NOT_EVALUATED rather than assigned a verdict the evidence does not support.
  const gateSubjects: SettlementLineage[] = [];
  const gateRowIds = new Set<string>();

  const staged: {
    ledger: LedgerRow;
    boardRow: BoardRow;
    identity: ReturnType<typeof resolveRowIdentity>;
    pregame: PregameObservation | null;
    settlement: SettlementRecord | null;
    quarantine: QuarantineNote | null;
  }[] = [];

  for (const raw of board.leans ?? []) {
    const lean = raw as Record<string, unknown>;
    const id = String(lean.id ?? "");
    if (!id) continue;

    const boardRow: BoardRow = {
      id,
      gamePk: lean.gamePk as number | string,
      gameId: (lean.gameId as string | null) ?? null,
      marketKey: String(lean.marketKey ?? ""),
      marketLabel: (lean.marketLabel as string | null) ?? null,
      line: typeof lean.line === "number" ? lean.line : null,
      lean: (lean.lean as string | null) ?? null,
      playerId: (lean.playerId as number | string | null) ?? null,
      playerName: (lean.playerName as string | null) ?? null,
      commenceTime: (lean.commenceTime as string | null) ?? null,
      modelProbOver: typeof lean.modelProbOver === "number" ? lean.modelProbOver : null,
      modelProbUnder: typeof lean.modelProbUnder === "number" ? lean.modelProbUnder : null,
      impliedOver: typeof lean.impliedOver === "number" ? lean.impliedOver : null,
      impliedUnder: typeof lean.impliedUnder === "number" ? lean.impliedUnder : null,
      homeTeamAbbr: (lean.homeTeamAbbr as string | null) ?? null,
      awayTeamAbbr: (lean.awayTeamAbbr as string | null) ?? null,
      // Deliberately NOT populated from the board's file-level `generatedAt` or from `commenceTime`.
      // A build timestamp is not an observation time, and a scheduled start read after the fact is not
      // a pregame stamp. Both would turn every legacy row into a "proven" one on paper.
      capturedAt: null,
      eventStart: null,
    };

    const ledgerRow: LedgerRow = settledById.get(id) ?? {
      id,
      date,
      outcome: "Pending",
      gamePk: boardRow.gamePk,
      marketKey: boardRow.marketKey,
      line: boardRow.line,
      lean: boardRow.lean,
    };

    const identity = resolveRowIdentity(identityIndex, boardRow);
    const pregame = archive.observations.lookup({
      gamePk: boardRow.gamePk,
      marketKey: boardRow.marketKey,
      playerId: boardRow.playerId,
      playerName: boardRow.playerName,
      line: boardRow.line,
      side: boardRow.lean,
    });
    const archiveSettlement = archive.settlementByGamePk.get(String(boardRow.gamePk)) ?? null;
    const settlement: SettlementRecord | null = archiveSettlement
      ? { ...archiveSettlement, outcome: ledgerRow.outcome ?? null }
      : { outcome: ledgerRow.outcome ?? null, sourceRef: null, sourceType: null, gradedAgainstId: ledgerRow.gamePk ?? null, finalizedAt: null };

    const rowRefusal = refusalKey(date, boardRow);
    const quarantine: QuarantineNote | null = dateQuarantined
      ? {
          scope: "date",
          reason: ctx.quarantineReason.get(date) ?? "this slate was refused by an integrity gate",
          sourceRef: "public/data/research/terminal-summary.json",
        }
      : (rowRefusal ? (refusals.get(rowRefusal) ?? null) : null);

    if (pregame && archiveSettlement?.sourceType && archiveSettlement.finalizedAt && identity.eventId) {
      gateRowIds.add(id);
      gateSubjects.push({
        predictionId: id,
        eventId: identity.eventId,
        marketId: `${boardRow.marketKey}:${boardRow.line ?? ""}:${boardRow.lean ?? ""}`,
        outcome: ledgerRow.outcome ?? "Pending",
        settlementSource: archiveSettlement.sourceType,
        settledAt: archiveSettlement.finalizedAt,
        eventStart: archive.eventStartByGamePk.get(String(boardRow.gamePk)) ?? null,
        joinedProviderId: archive.providerEventByGamePk.get(String(boardRow.gamePk)) ?? null,
        gradedAgainstId: archiveSettlement.gradedAgainstId,
      });
    }

    staged.push({ ledger: ledgerRow, boardRow, identity, pregame, settlement, quarantine });
  }

  const gateViolations = new Map<string, string[]>();
  for (const v of validateSettlementLineage(gateSubjects)) {
    for (const subject of v.subjects) {
      if (gateRowIds.has(subject)) {
        gateViolations.set(subject, [...(gateViolations.get(subject) ?? []), `${v.code}: ${v.message}`]);
      }
    }
  }

  const rows = staged.map((s) =>
    deriveRowLineage({
      ledger: s.ledger,
      board: s.boardRow,
      identity: s.identity,
      pregame: s.pregame,
      settlement: s.settlement,
      quarantine: s.quarantine,
      registryStatus: ctx.registryStatus.get(s.boardRow.marketKey) ?? "UNKNOWN",
      calibrationVersion: ctx.calibrationVersion,
      lineageViolations: gateViolations.get(s.ledger.id) ?? [],
      lineageEvaluated: gateRowIds.has(s.ledger.id),
    }),
  );

  const violations = rows.flatMap((r) => validateRowLineage(r).map((v) => `${v.code} [${v.rowId}]: ${v.message}`));

  return {
    date,
    rows,
    coverage: summarizeCoverage(rows),
    violations,
    archivePresent: archive.files > 0,
  };
}

// ── reading the exported artifact ──────────────────────────────────────────────────────────────

export interface LineageIndexEntry {
  readonly date: string;
  readonly rowLevel: boolean;
  readonly total: number;
  readonly byState: Readonly<Record<string, number>>;
  readonly rowLevelClaimable: number;
  readonly countable: number;
}

export interface LineageIndexArtifact {
  readonly kind: string;
  readonly rowSchemaVersion: string;
  readonly generatedAt: string;
  readonly asOfSettledDate: string | null;
  readonly dates: readonly LineageIndexEntry[];
}

/** Read the exported index, or null when it is absent or built under a schema this build cannot read. */
export function loadLineageIndex(): LineageIndexArtifact | null {
  const artifact = readJson<LineageIndexArtifact>(path.join(LINEAGE_ARTIFACT_DIR, "index.json"));
  if (!artifact) return null;
  return artifact.rowSchemaVersion === ROW_SCHEMA_VERSION ? artifact : null;
}

/** Read one date's exported envelopes. Null on absence or a schema this build does not understand. */
export function loadDateLineageArtifact(date: string): readonly ResearchRowLineage[] | null {
  const artifact = readJson<{ rowSchemaVersion?: string; rows?: ResearchRowLineage[] }>(
    path.join(LINEAGE_ARTIFACT_DIR, `${date}.json`),
  );
  if (!artifact || artifact.rowSchemaVersion !== ROW_SCHEMA_VERSION) return null;
  return artifact.rows ?? [];
}
