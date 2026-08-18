/**
 * WHAT A NAMED-BUT-UNBUILT SIGNATURE PRODUCT STILL NEEDS — derived, never typed.
 *
 * Goal Rush and Bucket Blitz are named and unbuilt. That is a legitimate state, but "coming soon"
 * as a hand-written string rots in both directions: it stays up after the inputs land, and it says
 * nothing about how far away the product actually is. A reader deserves better than a word, and the
 * roadmap deserves a claim that cannot drift from the repo.
 *
 * So this reads the same twelve-stage gate the internal maturity assessment uses
 * (lib/sports/sport-gate.mjs) and narrows it to the stages a SIGNATURE PRODUCT specifically needs.
 * The gate is broader than one product — a sport can miss `monitoring` and still be able to publish
 * a single flagship read — so each product declares its own required subset and is measured only on
 * that. Whatever it needs and does not have is what the page prints.
 *
 * The counts beside it come from artifacts on disk, not from prose: 380 captured fixtures is a fact
 * the file can be asked for. Nothing here produces, implies, or shades a prediction — the whole
 * point of the module is to say precisely what we cannot yet predict, and why.
 */
import fs from "node:fs";
import path from "node:path";
import { SPORT_ASSESSMENTS } from "@/lib/sports/sport-assessments.mjs";
import { GATE_STAGES } from "@/lib/sports/sport-gate.mjs";

export interface StageGap {
  readonly id: string;
  readonly name: string;
  /** What would count as proof for this stage — the gate's own wording, not a restatement. */
  readonly proof: string;
  readonly status: string;
}

/*
 * NO `evidence` FIELD, DELIBERATELY.
 *
 * The first version carried the assessment's evidence prose through to the page, and it leaked
 * immediately: the receipts are internal engineering notes, and they name program numbers, internal
 * research paths, guard filenames and model performance figures ("Elo log loss 0.6161 / 65.8%").
 * Two separate guards caught it — the public-export string scan and this module's own no-percentage
 * rule — which is the system working, but the field should not have existed to be rendered.
 *
 * Worse than the leak: a research log loss printed on a page whose headline is "there are no picks
 * here" reads as a capability claim, from a model that has not passed a calibration bar. The status
 * and the gate's own proof requirement are the honest public content, and they are all this returns.
 * Internal detail belongs on the internal surface, which already has it.
 */

export interface FeedFact {
  readonly label: string;
  readonly detail: string;
}

export interface ProductReadiness {
  readonly sport: string;
  /** Stages this product needs that are PROVEN today. */
  readonly met: readonly StageGap[];
  /** Stages this product needs that are not. These are the reason it is not built. */
  readonly missing: readonly StageGap[];
  /** Real, checkable facts about what IS on disk for this sport. */
  readonly haveNow: readonly FeedFact[];
  /** True only when every required stage is PROVEN. Never enough on its own to publish. */
  readonly buildable: boolean;
}

/**
 * The stages a single flagship read cannot be published without.
 *
 * `monitoring` and `owner` are deliberately excluded: they gate a DAILY AUTOMATED product, and a
 * signature read could ship behind a manual run without them. Including them would overstate the
 * distance. `calibration` is NOT excluded — a scorer or points read that has never been validated
 * against settled results is exactly the thing this codebase has already refused three times.
 */
const REQUIRED_STAGES = ["schedule", "identity", "data", "markets", "model", "calibration", "qualification", "products", "publication", "settlement"] as const;

/** Count rows in a captured artifact without trusting its filename to describe its contents. */
function rowsIn(file: string): number {
  try {
    const doc = JSON.parse(fs.readFileSync(file, "utf8")) as { rows?: unknown[] };
    return Array.isArray(doc.rows) ? doc.rows.length : 0;
  } catch { return 0; }
}

function newestCapture(dir: string, prefix: string): string | null {
  try {
    const f = fs.readdirSync(dir).filter((n) => n.startsWith(prefix) && n.endsWith(".json")).sort().pop();
    return f ? path.join(dir, f) : null;
  } catch { return null; }
}

const prettyDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric" });

/** What each sport verifiably HAS today — so the page is not a list of absences alone. */
function feedFacts(sport: string, root: string): FeedFact[] {
  if (sport === "epl") {
    const file = newestCapture(path.join(root, "soccer", "epl", "fixtures"), "capture-");
    if (!file) return [];
    const doc = JSON.parse(fs.readFileSync(file, "utf8")) as { rows?: Array<{ kickoffIso?: string }>; generatedAt?: string };
    const rows = doc.rows ?? [];
    const next = rows.map((r) => r.kickoffIso).filter((k): k is string => Boolean(k)).sort()[0];
    return [
      { label: "Fixtures captured", detail: `${rows.length} matches of the 2026-27 season, from a public-domain source` },
      ...(next ? [{ label: "Season opens", detail: prettyDate(next) }] : []),
    ];
  }
  if (sport === "nba") {
    const file = path.join(root, "nba", "schedule", "latest.json");
    const n = rowsIn(file);
    if (!n) return [];
    const doc = JSON.parse(fs.readFileSync(file, "utf8")) as { rows?: Array<{ dateUtc?: string }> };
    const next = (doc.rows ?? []).map((r) => r.dateUtc).filter((d): d is string => Boolean(d)).sort()[0];
    return [
      { label: "Games captured", detail: `${n} confirmed 2026-27 dates — the schedule is captured as the league releases it, never inferred` },
      ...(next ? [{ label: "Season opens", detail: prettyDate(next) }] : []),
    ];
  }
  return [];
}

/**
 * Measure one unbuilt product against the gate.
 *
 * @param sport the gate key ("epl", "nba")
 * @param root  the data root, so tests can point at a fixture rather than the live tree
 */
export function productReadiness(sport: string, root: string): ProductReadiness {
  const stages = (SPORT_ASSESSMENTS as Record<string, { stages?: Record<string, { status?: string; evidence?: string }> }>)[sport]?.stages ?? {};
  const met: StageGap[] = [];
  const missing: StageGap[] = [];

  for (const id of REQUIRED_STAGES) {
    const def = GATE_STAGES.find((s: { id: string }) => s.id === id);
    if (!def) continue;
    const status = stages[id]?.status ?? "UNPROVEN";
    const gap: StageGap = { id, name: def.name, proof: def.proof, status };
    (status === "PROVEN" ? met : missing).push(gap);
  }

  return { sport, met, missing, haveNow: feedFacts(sport, root), buildable: missing.length === 0 };
}
