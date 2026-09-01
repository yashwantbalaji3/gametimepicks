/**
 * CROSS-SURFACE TRUTH — do the pages agree with the control plane, and with each other?
 *
 * Program 227 · Release H. Dead links and route inventory already have guards; what nothing checked
 * was whether the RENDERED pages agree with the offered-window matrix about what day it is and which
 * sports have anything on. That is the gap every incident in this repository has fallen through:
 * /today counted one way, a sport hub another, the console a third, and each was right about its own
 * artifact.
 *
 * THE MATRIX IS THE DENOMINATOR, and it is built from acquisition artifacts — not from the pages it
 * audits. A reconciler whose denominator came from the surfaces would agree with them by
 * construction, which is the same inversion that made the offered window audit its own producer.
 *
 * REGION BEFORE TEXT. Every check states which region it needs, and a region that cannot be found is
 * a FINDING rather than a silent pass. Four guards in this repository have already passed by
 * scanning navigation chrome, a serialized payload, or an area that did not contain the thing they
 * meant to read; a check that cannot prove it found its subject has not checked anything.
 *
 * Pure. Surfaces and the matrix are passed in.
 */

export const FINDING_KINDS = Object.freeze([
  "REGION_NOT_FOUND",
  "DATE_DRIFT",
  "QUIET_SPORT_PRESENTED_LIVE",
  "LIVE_SPORT_PRESENTED_QUIET",
  "INTERNAL_VOCABULARY_LEAK",
]);

/** The matrix's own state names. None of them belongs in customer copy. */
const INTERNAL_VOCABULARY = [
  "NOT_YET_CAPTURED", "OFFERED_UNPRICED", "OFFERED_PRICED", "FORECAST_READY",
  "JOIN_FAILED", "SOURCE_STALE", "WORK_OWED", "INCONSISTENT",
];

/** A sport with nothing scheduled anywhere in its horizon. */
const QUIET_STATES = new Set(["NO_EVENTS"]);

/** Phrases that assert a slate is live right now. Deliberately narrow — see the test file. */
const LIVE_ASSERTIONS = [
  /\btonight's slate\b/i,
  /\bgames? (?:are )?live now\b/i,
  /\bslate is live\b/i,
];

/*
 * A date only drifts if the page presents it as THE CURRENT SLATE. Pages legitimately render
 * historical dates all the time — settled results, archive entries, capture stamps — and a detector
 * that flags every one of them produces five findings a day, none of them real, and gets switched
 * off. Only a date in a current-slate context is a claim about today.
 */
const CURRENT_SLATE_DATE = /(?:today|tonight|current slate|this slate)[^.]{0,60}?\b(20\d\d-\d{2}-\d{2})\b|\b(20\d\d-\d{2}-\d{2})\b[^.]{0,40}?(?:slate|tonight)/gi;

/** ET calendar day for an instant — a 2026-09-10T00:20Z kickoff renders as 2026-09-09 in ET. */
const etDay = (iso) => {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
};

/**
 * @param {object} p
 * @param {object} p.matrix     the committed offered-window matrix
 * @param {Array<{route: string, region: string|null}>} p.surfaces
 *        `region` is the rendered text of the section this check owns, or null when it was not found
 * @param {string} p.today      the ET product date every surface should be describing
 */
export function reconcileSurfaces({ matrix, surfaces, today }) {
  const findings = [];
  const bySport = new Map((matrix?.sports ?? []).map((s) => [s.sport, s]));

  for (const surface of surfaces ?? []) {
    const { route, region } = surface;

    /*
     * The region check comes first and is a finding in its own right. A surface whose section moved
     * or was renamed must fail loudly; silently skipping it is how a guard keeps reporting success
     * about a page it no longer reads.
     */
    if (region == null) {
      findings.push({ kind: "REGION_NOT_FOUND", route, detail: "the region this check owns was not found in the rendered page" });
      continue;
    }

    /*
     * DATE DRIFT. Any ISO date the page renders must be one the matrix knows about — today, or an
     * event date inside the window. A page showing a date from neither is describing a different
     * day than the platform is operating.
     */
    const known = new Set([today, matrix?.date].filter(Boolean));
    for (const s of matrix?.sports ?? []) {
      for (const r of s.rows ?? []) {
        if (!r.startUtc) continue;
        /* BOTH calendars. The pages render ET; the matrix stores UTC. A 2026-09-10T00:20Z kickoff
           is Tuesday the 9th in ET, and comparing only the UTC prefix called that drift. */
        known.add(String(r.startUtc).slice(0, 10));
        const et = etDay(r.startUtc);
        if (et) known.add(et);
      }
      if (s.windowDate) known.add(s.windowDate);
    }
    /*
     * SCOPE, NOT A HEURISTIC. Only surfaces whose subject IS the current slate are checked for date
     * drift. /results and the archives render past dates as their content — that is what they are
     * for — and no flat-text heuristic reliably separates "the settled row for 08-30" from "08-30
     * presented as tonight". A detector that cannot be made precise should not ship as a hard gate;
     * that is how a repository ends up with guards everyone has learned to ignore. The caller
     * declares which surfaces make a current-slate claim, and only those are held to it.
     */
    if (surface.currentSlateSurface === false) {
      // still checked for vocabulary leaks and live-claims below
    } else for (const m of region.matchAll(CURRENT_SLATE_DATE)) {
      const found = m[1] ?? m[2];
      if (found && !known.has(found)) {
        findings.push({ kind: "DATE_DRIFT", route, detail: `presents ${found} as the current slate, which is neither today (${today}) nor any event date in the window` });
        break;
      }
    }

    // Internal state names must never reach customer copy.
    for (const term of INTERNAL_VOCABULARY) {
      if (region.includes(term)) {
        findings.push({ kind: "INTERNAL_VOCABULARY_LEAK", route, detail: `renders the matrix's internal state "${term}"` });
        break;
      }
    }

    /*
     * A QUIET SPORT MUST NOT BE PRESENTED AS LIVE. This is the claim customers act on, and it is the
     * one the platform has got wrong most often — a settled slate re-presented as tonight's.
     */
    for (const [sport, s] of bySport) {
      if (!QUIET_STATES.has(s.state)) continue;
      /*
       * PROXIMITY, not co-occurrence. /build renders "MLB 18 tonight's slate" beside a filter row
       * containing an NBA chip — the live claim belongs to MLB and the sport name is a label
       * elsewhere in the same blob. Without a distance requirement this fired on entirely honest
       * copy, and a detector that cries wolf is switched off, which is the same outcome as not
       * having one.
       */
      for (const claim of LIVE_ASSERTIONS) {
        const hit = claim.exec(region);
        if (!hit) continue;
        const near = region.slice(Math.max(0, hit.index - 40), hit.index + hit[0].length + 40);
        if (new RegExp(`\\b${sport}\\b`, "i").test(near)) {
          findings.push({
            kind: "QUIET_SPORT_PRESENTED_LIVE",
            route,
            detail: `${sport.toUpperCase()} is ${s.state} in the matrix, but this page asserts a live slate beside its name`,
          });
          break;
        }
      }
    }
  }

  return {
    checked: (surfaces ?? []).length,
    regionsFound: (surfaces ?? []).filter((s) => s.region != null).length,
    findings,
    state: findings.length === 0 ? "RECONCILED" : "FINDINGS",
  };
}

/**
 * Extract one page's main region. Returns null when it cannot be found — never the whole document,
 * because falling back to the document is how a check comes to read navigation chrome and the
 * serialized payload instead of the page.
 */
export function mainRegion(html) {
  if (typeof html !== "string") return null;
  const m = /<main[^>]*>([\s\S]*?)<\/main>/.exec(html);
  if (!m) return null;
  return m[1]
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;|&rsquo;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
