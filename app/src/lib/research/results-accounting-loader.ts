/**
 * SPRINT 053 — server-side loader that feeds the canonical accounting adapter real slates.
 *
 * Kept apart from `results-accounting.ts` so the accounting itself stays pure and testable without
 * touching disk. This file does the reading; that file does the reasoning.
 *
 * WHY IT STARTS FROM BOARDS
 * The settled ledger is authoritative for what was GRADED and silent about everything else — rows that
 * were generated but never gradable are not written to it at all. Enumerating boards and joining the
 * ledger into them is what makes the population complete; enumerating the ledger would quietly report
 * a smaller universe and the missing rows would read as if they never happened.
 *
 * Server-only.
 */
import fs from "node:fs";
import path from "node:path";

import {
  GRADABLE_MARKETS,
  type DateAccounting,
  reconcile,
} from "./results-accounting";
import { loadTerminal } from "./public-contract-adapter";

const APP = process.cwd();
const BOARDS = path.join(APP, "public/data/mlb/boards");
const LEDGER = path.join(APP, "public/data/mlb/results/settled_leans.jsonl");

const NON_DIRECTIONAL = new Set(["", "Pass", "No Play"]);

/** Ledger rows grouped by their own date, which is authoritative for settlement. */
function ledgerByDate(): Map<string, Map<string, { id: string; outcome: string; eventId?: string | null }>> {
  const out = new Map<string, Map<string, { id: string; outcome: string; eventId?: string | null }>>();
  if (!fs.existsSync(LEDGER)) return out;
  for (const line of fs.readFileSync(LEDGER, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as { id: string; date: string; outcome: string; eventId?: string | null };
    if (!out.has(r.date)) out.set(r.date, new Map());
    out.get(r.date)!.set(r.id, { id: r.id, outcome: r.outcome, eventId: r.eventId ?? null });
  }
  return out;
}

const etToday = (): string =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

/**
 * Accounting for the most recent `limit` slates that have a board.
 *
 * Quarantined dates are included — they are the point. A date the settlement gate refused must appear
 * in the historical record with an explanation, not vanish from the list.
 */
export function loadRecentAccounting(limit = 8): DateAccounting[] {
  if (!fs.existsSync(BOARDS)) return [];
  const quarantined = new Set(loadTerminal().quarantines.map((q) => q.date));
  const ledger = ledgerByDate();
  const today = etToday();

  const dates = fs
    .readdirSync(BOARDS)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 10))
    .sort()
    .reverse()
    .slice(0, limit);

  const out: DateAccounting[] = [];
  for (const date of dates) {
    let board: { leans?: { id: string; marketKey: string; lean: string | null }[] };
    try {
      board = JSON.parse(fs.readFileSync(path.join(BOARDS, `${date}.json`), "utf8"));
    } catch {
      continue;
    }
    const generated = (board.leans ?? []).map((l) => ({ id: l.id, marketKey: l.marketKey, lean: l.lean }));
    const settled = ledger.get(date) ?? new Map();

    // Rows that are gradable and directional but absent from the ledger on a COMPLETED slate were
    // generated and never produced a stat — the class the ledger does not record. On a live slate the
    // same absence simply means "not yet", so it stays pending.
    const slateComplete = date < today;
    const unavailableIds = new Set(
      slateComplete
        ? generated
            .filter(
              (g) =>
                GRADABLE_MARKETS.includes(g.marketKey) &&
                !NON_DIRECTIONAL.has(g.lean ?? "") &&
                !settled.has(g.id),
            )
            .map((g) => g.id)
        : [],
    );

    out.push(
      reconcile({
        date,
        generated,
        settled,
        unavailableIds,
        quarantined: quarantined.has(date),
        slateComplete,
      }),
    );
  }
  return out;
}

/**
 * The newest slate suitable as a DEFAULT performance view.
 *
 * Never a quarantined date and never a partial one: defaulting to either would present an incomplete
 * or withheld slate as though it were a normal result. Returns null rather than falling back to
 * something misleading.
 */
export function newestCleanAccounting(rows: readonly DateAccounting[]): DateAccounting | null {
  return rows.find((r) => r.integrity === "CLEAN" && r.decisive > 0) ?? null;
}
