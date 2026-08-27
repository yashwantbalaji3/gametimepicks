/**
 * Server-side reader for the committed publication-SLO artifact.
 *
 * The artifact is written by `scripts/ops/publication-slo.mjs`, which rides every workflow that runs
 * during the day (see `.github/actions/publication-slo/`). This is the only way a public surface
 * learns today's publication deadline — and a deadline is the only thing that lets a page say "late"
 * instead of the same patient sentence it says at 6 AM.
 *
 * FAILS OPEN, DELIBERATELY. A missing or unreadable artifact returns nulls, and every consumer then
 * falls back to the pre-deadline wording. The alternative — treating absence as evidence of lateness
 * — would put an incident banner on the site the first time this file was not yet committed.
 */
import fs from "node:fs";
import path from "node:path";

import { currentEtDate } from "../freshness";

export interface PublicationSlo {
  /** MLB day-level verdict: PUBLISHED | PUBLISHING | INPUT_GATED | NO_EVENT | INCIDENT | UNKNOWN. */
  state: string | null;
  /** Worst-of across MLB, NFL, UFC and EPL. One late sport makes the platform late. */
  platformState: string | null;
  /** When today's slate was due, derived from the earliest eligible start. */
  publishDeadlineUtc: string | null;
  /** The ET date this verdict describes — a verdict for another day tells you nothing about today. */
  date: string | null;
  reason: string | null;
}

const EMPTY: PublicationSlo = {
  state: null,
  platformState: null,
  publishDeadlineUtc: null,
  date: null,
  reason: null,
};

/**
 * @param today the ET date the caller is rendering. A verdict stamped for a different date is
 *   discarded rather than reused — a deadline from yesterday would mark today late from midnight.
 */
export function readPublicationSlo(dataRoot: string, today?: string): PublicationSlo {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dataRoot, "ops", "publication-slo.json"), "utf8"));
    if (today && raw?.date !== today) return EMPTY;
    return {
      state: typeof raw?.state === "string" ? raw.state : null,
      platformState: typeof raw?.platformState === "string" ? raw.platformState : null,
      publishDeadlineUtc: typeof raw?.publishDeadlineUtc === "string" ? raw.publishDeadlineUtc : null,
      date: typeof raw?.date === "string" ? raw.date : null,
      reason: typeof raw?.reason === "string" ? raw.reason : null,
    };
  } catch {
    return EMPTY;
  }
}

/**
 * The deadline for today, resolved against the standard public data root.
 *
 * A convenience for the seven pages that render the liveness banner: they each need one string, and
 * making every one of them assemble a data root and an ET date to get it is how a contract ends up
 * with seven slightly different call sites. Returns null on anything unexpected — see the fail-open
 * note above.
 */
export function publicationDeadlineUtc(): string | null {
  try {
    return readPublicationSlo(path.join(process.cwd(), "public", "data"), currentEtDate()).publishDeadlineUtc;
  } catch {
    return null;
  }
}
