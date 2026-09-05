/**
 * THE INCIDENT REGISTER — derived from the watchdogs, never typed by hand.
 *
 * Program 231 · K1. The console had thirty-two panels and no incidents panel. Open failures were
 * legible only to whoever went looking in the right artifact: Program 230 found End Zone Vault
 * missing three days of receipts behind nine green workflow runs, and nothing on the operator's
 * screen would have shown it.
 *
 * The obvious way to add one is a committed list of incident cards. That is the failure mode this
 * console already refuses everywhere else — a hand-kept list drifts from the system the moment
 * somebody forgets to edit it, and a stale incident board is worse than none because it reads as
 * surveyed. So every row here is DERIVED from an authority that is already deciding the same thing:
 *
 *   product receipts' watchdog   INCIDENT_OPEN · MISSING_DAILY_EVALUATION · STALE_ACTIVE_CARD ·
 *                                RESULT_BEYOND_WINDOW
 *   lifecycle coverage           products that publish without being able to settle
 *   offered-window matrix        events owed past their deadline, and conservation findings
 *
 * A row appears because an authority is reporting it right now, and it disappears when that
 * authority stops — not when a person decides it is fixed. There is no field an operator can edit
 * to make an incident go away.
 *
 * WHAT IS NOT DERIVABLE, AND HOW IT IS HANDLED. Cause, owner, mitigation and clearing event are not
 * in the receipts. They are attached per KIND from a closed table below, so the prose belongs to the
 * failure class rather than to the individual row. A new kind must be added to that table or the
 * builder refuses the row outright — an unrecognised alarm surfaces as UNCLASSIFIED with its raw
 * detail rather than being dropped, because an incident nobody wrote a paragraph for is still an
 * incident.
 */
import fs from "node:fs";
import path from "node:path";

import { PRODUCT_REGISTRY } from "../products/lifecycle-registry.mjs";

export const INCIDENT_REGISTER_VERSION = 1;

/** Severity is a property of the failure class, not a judgement made per row. */
export const INCIDENT_SEVERITIES = Object.freeze(["P1", "P2", "P3", "GATED"]);

/**
 * The closed classification. Each entry answers the four questions an operator asks in order:
 * what broke, who owns it, how we found out, and what exactly makes it go away.
 */
export const INCIDENT_KINDS = Object.freeze({
  INCIDENT_OPEN: {
    severity: "P2",
    cause: "the product's daily evaluation typed an operational gap rather than a product decision",
    owner: "product automation",
    detection: "daily product receipt — the lifecycle derivation refused to call a missing input a hold",
    mitigation: "the receipt names the gap; the product publishes nothing rather than a card it cannot stand behind",
    clearing: "a later receipt for this product derives a state other than INCIDENT",
  },
  MISSING_DAILY_EVALUATION: {
    severity: "P1",
    cause: "a governed product produced no receipt for the product day at all",
    owner: "the product's producer workflow",
    detection: "product watchdog — absence of a receipt, which needs no failed run object to notice",
    mitigation: "the product is reported as unevaluated; nothing downstream may treat silence as a hold",
    clearing: "a receipt exists for this product on a later product day",
  },
  STALE_ACTIVE_CARD: {
    severity: "P2",
    cause: "a card locked and stayed ACTIVE past the window in which its event should have settled",
    owner: "settlement automation",
    detection: "product watchdog — lock stamp age against the settlement window",
    mitigation: "the card remains visibly unsettled; no result is assumed",
    clearing: "the settler joins an official result and the day leaves ACTIVE",
  },
  RESULT_BEYOND_WINDOW: {
    severity: "P2",
    cause: "the official result for a settled-pending card has not arrived inside its window",
    owner: "results capture",
    detection: "product watchdog — awaiting duration against the result window",
    mitigation: "the card stays AWAITING_RESULT; grading uncertainty as a loss is refused",
    clearing: "the official result lands and the day settles",
  },
  PUBLISHES_WITHOUT_SETTLING: {
    severity: "P1",
    cause: "a product can publish a card and has no path to grade it — an unfalsifiable public record",
    owner: "product lifecycle registry",
    detection: "lifecycle coverage — the settlement dimension is absent while the public route is not",
    mitigation: "the coverage artifact singles this shape out rather than counting it as one gap among six",
    clearing: "a settlement adapter exists and the product registers with it",
  },
  COVERAGE_GAP: {
    severity: "P3",
    cause: "a signature product is missing one of the six lifecycle mechanics",
    owner: "product lifecycle registry",
    detection: "lifecycle coverage inventory",
    mitigation: "the product is reported PARTIAL with the missing dimension named",
    clearing: "the missing owner is registered and the coverage artifact reports GOVERNED",
  },
  OFFERED_WINDOW_OWED: {
    severity: "P2",
    cause: "a sportsbook-open event passed its derived publication deadline with no forecast and no refusal",
    owner: "the sport's generation workflow",
    detection: "offered-window matrix — owed rows past deadline",
    mitigation: "the event is listed as owed rather than silently omitted from the denominator",
    clearing: "the event is published or refused with a named reason",
  },
  RECEIPT_DAY_MISSING: {
    severity: "P1",
    cause: "the product receipt for the current day is OVERDUE — its producer's deadline has passed and no receipt exists",
    owner: "daily product receipts workflow",
    detection: "incident register — the newest committed receipt is older than the current product day",
    mitigation: "no product state is claimed for today; every product row on this board is from an earlier day and says so",
    clearing: "a receipt is written for the current product day",
  },
  OFFERED_WINDOW_FINDING: {
    severity: "P2",
    cause: "the offered-window conservation equation did not balance",
    owner: "offered-window owner",
    detection: "offered-window matrix — conservation check",
    mitigation: "the matrix reports the finding rather than presenting a total that does not decompose",
    clearing: "offered = published + refused + pending balances again",
  },
});

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/**
 * When the day's product receipt becomes LATE.
 *
 * `daily-products` is scheduled at 15:30 UTC, and GitHub's queue routinely delays it — the four
 * runs before this was written landed 18:31, 18:50, 18:52 and 18:31 UTC. A deadline set at the cron
 * time would alarm every single day for three hours about a job that always arrives. The grace is
 * therefore measured against observed drift, not against the schedule's intent, and is stated here
 * rather than buried in a comparison.
 */
const RECEIPT_DUE_UTC_HOUR = 15;   // the daily-products cron
const RECEIPT_GRACE_HOURS = 5;     // observed queue drift, ~3h, with margin

function receiptDeadlineUtc(etDate, dueHour = RECEIPT_DUE_UTC_HOUR, graceHours = RECEIPT_GRACE_HOURS) {
  if (!etDate) return null;
  const [y, m, d] = etDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d, dueHour) + graceHours * 3600_000;
}

/** Newest dated JSON in a directory, or null. Dates are the filenames; no clock is read. */
function newestDated(dir) {
  try {
    const f = fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort().pop();
    return f ? { date: f.slice(0, 10), doc: readJson(path.join(dir, f)) } : null;
  } catch { return null; }
}

/**
 * Build the register from the committed authorities.
 *
 * `etDate` is the current product day, INJECTED so this module stays deterministic — same artifacts
 * plus same date in, same rows out. Omit it only where no clock is available; the staleness row is
 * then not derivable and the register says nothing about it rather than guessing.
 *
 * @param {{ appDir: string, etDate?: string|null, nowUtcMs?: number|null,
 *            receiptDueUtcHour?: number, receiptGraceHours?: number }} o
 * @returns {{ present: boolean, state: string, asOf: string|null, actionable: number, rows: any[], pending: any[],
 *              counts: { P1: number, P2: number, P3: number, GATED: number } }}
 */
export function buildIncidentRegister({ appDir, etDate = null, nowUtcMs = null, ...opts } = {}) {
  const ROOT = path.join(appDir, "..");
  const receipts = newestDated(path.join(ROOT, "data", "internal", "products", "receipts"));
  const coverage = readJson(path.join(ROOT, "data", "internal", "products", "lifecycle-coverage.json"));
  const offered = newestDated(path.join(ROOT, "data", "internal", "offered-window"));

  if (!receipts && !coverage && !offered) {
    return { present: false, state: "UNKNOWN", asOf: null, actionable: 0, rows: [], pending: [], counts: { P1: 0, P2: 0, P3: 0, GATED: 0 } };
  }

  const rows = [];
  /** Work that is not yet late. Visible, never counted as an incident. */
  const pending = [];
  /*
   * A FOUNDER GATE IS NOT AN ACTIONABLE INCIDENT.
   *
   * Moonshot genuinely publishes without a settlement path — that is the unfalsifiable-record shape,
   * and it is REAL. It is also paused on an exact token, so no engineering can clear it. Reporting
   * it as an open P1 beside a repairable failure puts a thing nobody may touch at the top of the
   * operator's queue every single day, which is how a board stops being read.
   *
   * The row is KEPT and visible — hiding a real shape would be worse — but it is typed as gated,
   * its clearing event becomes the founder's answer, and it is counted separately from the work
   * somebody can actually do today.
   */
  const gateFor = (subject) => PRODUCT_REGISTRY.get(String(subject).split(":")[0])?.founderGate ?? null;
  const push = (kind, subject, detail, source) => {
    const k = INCIDENT_KINDS[kind];
    if (!k) {
      /* An alarm this table does not describe is still an alarm. Surfacing it UNCLASSIFIED keeps the
         operator informed and makes the missing paragraph visible; dropping it would make the
         register quietly narrower than the watchdogs it reports. */
      rows.push({ id: `${kind}:${subject}`, kind, severity: "P2", subject, detail, source,
        cause: "unclassified alarm — this kind has no entry in INCIDENT_KINDS",
        owner: "operator", detection: source, mitigation: "reported verbatim",
        clearing: "the authority stops reporting it, or the kind is classified" });
      return;
    }
    const gate = gateFor(subject);
    rows.push({
      id: `${kind}:${subject}`, kind, subject, detail, source, ...k,
      severity: gate ? "GATED" : k.severity,
      founderGate: gate,
      ...(gate ? { clearing: `the founder answers ${gate}; no engineering path exists until then` } : {}),
    });
  };

  /*
   * THE WHOLE DAY MISSING IS THE FAILURE THE PER-PRODUCT WATCHDOG CANNOT SEE.
   *
   * That watchdog alarms for products inside a receipt. If no receipt exists for today, it has
   * nothing to iterate and reports nothing — so the board read "0 actionable" with the entire day's
   * evaluation absent. Probed by hiding today's receipt: the register went quiet and called it
   * GATED_ONLY.
   *
   * That is the same shape as the End Zone Vault defect this register was built to surface — silence
   * mistaken for health — reproduced one level up, in the thing watching for it.
   */
  /*
   * ABSENT IS NOT OVERDUE (P233 · A).
   *
   * The first version fired whenever the newest receipt predated the product day. At 15:05Z on
   * 2026-09-05 it reported P1 — for a receipt whose producer is scheduled at 15:30Z and which
   * historically lands nearer 18:40Z after GitHub's cron drift. The board said "1 actionable" about
   * a job that was not yet late.
   *
   * That is the failure this register exists to avoid, pointed at itself: a watchdog that cries wolf
   * gets switched off, and it takes the true alarms with it. A missing receipt is still VISIBLE
   * before its deadline — as PENDING, which is a fact — and becomes an incident only once the
   * deadline passes.
   */
  const dueAt = receiptDeadlineUtc(etDate, opts.receiptDueUtcHour, opts.receiptGraceHours);
  const overdue = Boolean(nowUtcMs && dueAt && nowUtcMs > dueAt);

  if (etDate && (!receipts || receipts.date < etDate)) {
    const detail = receipts
      ? `newest receipt is ${receipts.date}; the current product day is ${etDate}`
      : `no product receipt exists at all for ${etDate}`;
    if (overdue) {
      push("RECEIPT_DAY_MISSING", "all-products", detail,
        receipts ? `products/receipts/${receipts.date}.json` : "products/receipts/");
    } else {
      pending.push({
        kind: "RECEIPT_DAY_PENDING", subject: "all-products", detail,
        dueAtUtc: dueAt ? new Date(dueAt).toISOString() : null,
      });
    }
  }

  for (const a of receipts?.doc?.watchdog ?? []) {
    push(a.kind, a.product, a.detail ?? "", `products/receipts/${receipts.date}.json`);
  }

  for (const gap of coverage?.openGaps ?? []) {
    push("COVERAGE_GAP", gap.id, `missing ${(gap.missing ?? []).join(", ")}`, "products/lifecycle-coverage.json");
  }
  if (coverage?.publishesWithoutSettling?.length) {
    for (const id of coverage.publishesWithoutSettling) {
      push("PUBLISHES_WITHOUT_SETTLING", id, "publishes with no settlement path", "products/lifecycle-coverage.json");
    }
  }

  for (const s of offered?.doc?.sports ?? []) {
    for (const owed of s.owed ?? []) {
      push("OFFERED_WINDOW_OWED", `${s.sport}:${owed.eventId ?? owed.id ?? "event"}`,
        owed.reason ?? "past its derived deadline", `offered-window/${offered.date}.json`);
    }
    for (const f of s.findings ?? []) {
      push("OFFERED_WINDOW_FINDING", s.sport, typeof f === "string" ? f : JSON.stringify(f),
        `offered-window/${offered.date}.json`);
    }
  }

  const counts = { P1: 0, P2: 0, P3: 0, GATED: 0 };
  for (const r of rows) counts[r.severity] = (counts[r.severity] ?? 0) + 1;
  /* Actionable = what an operator can do something about today. Gated rows stay visible and stay
     out of this number. */
  const actionable = rows.filter((r) => !r.founderGate).length;

  return {
    present: true,
    actionable,
    state: actionable === 0 ? (rows.length ? "GATED_ONLY" : "CLEAR") : counts.P1 > 0 ? "P1_OPEN" : "OPEN",
    asOf: receipts?.date ?? offered?.date ?? null,
    rows,
    /* Named separately so the console can show "due at HH:MM" without it reading as a failure. */
    pending,
    counts,
  };
}
