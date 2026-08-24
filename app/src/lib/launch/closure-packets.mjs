/**
 * SPORT CLOSURE PACKETS — the completion control plane (Program 196 · Release A).
 *
 * One derived unit per sport that answers, in a single place, the question every session has been
 * re-deriving by hand: what is proven, what is left, whose move is it, and what does the public
 * currently see. The packet ECHOES source artifacts — the twelve-stage assessments, the work
 * board, the watches, the shared-blocker registry, the daily product receipt, the lane statuses
 * and the route inventory — and recomputes NOTHING that already has an authority. It may not
 * recompute model metrics and it may not touch money; those numbers appear here only as quoted
 * receipts with their source stamp attached.
 *
 * DETERMINISM IS THE CONTRACT. Same inputs, identical bytes: no clock reads (nowIso is an input),
 * no environment reads, stable key order via explicit construction, and `stableStringify` for the
 * committed artifact. The determinism test builds twice and compares bytes.
 *
 * CONTRADICTION GUARDS FAIL THE BUILD. A control plane that renders a contradiction as a warning
 * chip is a dashboard; one that refuses to build is a gate. Every guard below encodes a failure
 * this repository has already paid for — a green workflow whose artifact never landed (P066), a
 * fought card presented as next (P192), a hand-typed count quoted as live (the 08-24 operating
 * record shipping "0 paired" while the learning artifact said 3), internal surfaces leaking into
 * the public export (P073). Synthetic contradictions are part of the test suite: a guard that has
 * never fired is an intention, not a rule.
 */

import { GATE_STAGES } from "../sports/sport-gate.mjs";

export const PACKET_VERSION = 1;

/** Whose move a non-proven stage is. Closed vocabulary; anything else fails the build. */
export const BLOCKER_CLASSES = Object.freeze([
  "NONE",              // stage is PROVEN — nothing to move
  "ENGINEERING_READY", // actionable now, by us
  "REALITY_GATED",     // needs events to happen; cannot be coded
  "FOUNDER_DECISION",  // needs a decision or credential only the founder can supply
  "BLOCKED_EXTERNAL",  // blocked outside both engineering and the founder's stated queue
]);

/**
 * Public activation tiers (Program 196 · Release J vocabulary), DERIVED from stages — a polished
 * page cannot promote the underlying model because the tier never reads the page, only the gate.
 *
 *   NOT_PUBLIC        publication UNPROVEN — the sport has no public surface claim
 *   SCHEDULE_LIVE     public surface exists; model UNPROVEN — schedules/results only
 *   RESEARCH_LAB      public surface + a model with evidence, calibration not proven
 *   PUBLIC_BETA_MODEL publication and model both PROVEN, calibration still unproven — the model
 *                     publishes publicly under beta labels
 *   LIVE_ELIGIBLE     every one of the twelve stages PROVEN (founder activation still separate)
 */
export const PUBLIC_TIERS = Object.freeze([
  "NOT_PUBLIC", "SCHEDULE_ONLY", "SCHEDULE_LIVE", "RESEARCH_LAB", "PUBLIC_BETA_MODEL", "LIVE_ELIGIBLE",
]);

/** Release-train order (Program 196 §14): the queue is dependency-ordered by THIS, not alphabet. */
export const RELEASE_TRAIN_ORDER = Object.freeze(["mlb", "ufc", "epl", "nfl", "nba"]);

/**
 * The public routes each sport CLAIMS. Validated against the route inventory on every build —
 * a claimed route that the inventory does not class as public-facing is a contradiction, and so
 * is a claim for a sport whose tier is NOT_PUBLIC. NBA claims nothing by decision (Release F
 * creates its surface); an empty claim is a statement, not an omission.
 */
export const SPORT_PUBLIC_ROUTES = Object.freeze({
  mlb: Object.freeze(["/mlb"]),
  epl: Object.freeze(["/epl"]),
  nfl: Object.freeze(["/nfl"]),
  ufc: Object.freeze(["/ufc"]),
  nba: Object.freeze([]),
});

/**
 * How old each sport's current-event artifact may be before the packet calls it STALE, in hours.
 * These follow each lane's own scheduled cadence (the workflow census), not a wish: MLB regenerates
 * through the day; EPL around fixture clusters; NFL on its event window; UFC weekly per card; NBA
 * on the daily schedule sweep. A missing artifact is MISSING — never quietly fresh.
 */
export const CURRENT_EVENT_STALE_HOURS = Object.freeze({ mlb: 36, epl: 120, nfl: 72, ufc: 216, nba: 60 });

const ORDER_RANK = Object.fromEntries(RELEASE_TRAIN_ORDER.map((s, i) => [s, i]));
const STAGE_RANK = Object.fromEntries(GATE_STAGES.map((s, i) => [s.id, i]));

/**
 * Reality-gated is a property the assessment states in words — the stage cannot move until events
 * happen. Derived from the evidence text rather than a hand-kept side table, so the classification
 * moves when (and only when) the assessment does.
 */
const REALITY_RE = /reality[ _-]?gated|needs matches|needs bouts|needs games|it needs matches played|not promotable by engineering|until matches|until bouts|until enough .* fought/i;
/*
 * P198: a PARTIAL stage whose own words say the remaining move is the founder's — a rights
 * decision, an authorization, an activation or investment decision — is not engineering-ready,
 * and filing it as such puts it on a board where it sits failing until someone else acts (the
 * exact anti-pattern §16 names). Reality outranks founder when both appear: a decision cannot
 * conjure the games.
 */
const FOUNDER_RE = /founder (decision|rights|gate|action|activation)|founder decision to (invest|authorize)|requires a founder|founder-gated/i;

const dateStampsIn = (text) => [...String(text ?? "").matchAll(/20\d{2}-\d{2}-\d{2}/g)].map((m) => m[0]);

/** The latest dated stamp the assessment itself carries — when this stage was last ASSESSED. */
export function lastAssessedDate(stage) {
  const stamps = [...dateStampsIn(stage?.evidence), ...dateStampsIn(stage?.blocker)];
  return stamps.length ? stamps.sort().at(-1) : null;
}

export function classifyBlocker(stage) {
  const status = stage?.status ?? "UNPROVEN";
  if (status === "PROVEN") return "NONE";
  const text = `${stage?.evidence ?? ""} ${stage?.blocker ?? ""}`;
  if (status === "BLOCKED_EXTERNAL") return /founder/i.test(stage?.blocker ?? "") ? "FOUNDER_DECISION" : "BLOCKED_EXTERNAL";
  if (REALITY_RE.test(text)) return "REALITY_GATED";
  if (FOUNDER_RE.test(text)) return "FOUNDER_DECISION";
  return "ENGINEERING_READY";
}

export function derivePublicTier(stages, { claimedRoutes = null } = {}) {
  const get = (id) => stages[id]?.status ?? "UNPROVEN";
  const atLeastPartial = (id) => get(id) === "PROVEN" || get(id) === "PARTIAL";
  if (GATE_STAGES.every((s) => get(s.id) === "PROVEN")) return "LIVE_ELIGIBLE";
  /*
   * P198: a sport that CLAIMS no route of its own cannot be RESEARCH_LAB whatever its private
   * stages say — private research is not a public surface, and the tier is a claim about what a
   * reader can see. With a proven schedule it is SCHEDULE_ONLY (the /sports directory carries its
   * confirmed events honestly); without one it is NOT_PUBLIC. Route-blind callers (claimedRoutes
   * null) keep the stage-only derivation for back-compat.
   */
  if (Array.isArray(claimedRoutes) && claimedRoutes.length === 0) {
    return get("schedule") === "PROVEN" ? "SCHEDULE_ONLY" : "NOT_PUBLIC";
  }
  if (!atLeastPartial("publication")) return "NOT_PUBLIC";
  if (!atLeastPartial("model")) return "SCHEDULE_LIVE";
  if (get("publication") === "PROVEN" && get("model") === "PROVEN" && get("calibration") !== "PROVEN") return "PUBLIC_BETA_MODEL";
  return "RESEARCH_LAB";
}

/**
 * JSON with sorted object keys at every level — the committed artifact's byte contract. Arrays
 * keep their order (order IS information in a dependency queue); objects sort so an incidental
 * construction-order change can never masquerade as a content change.
 */
export function stableStringify(value, indent = 1) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]));
    }
    return v;
  };
  return JSON.stringify(sort(value), null, indent);
}

/* ── Contradiction guards ─────────────────────────────────────────────────────────────────────── */

/**
 * Re-derive every claim a packet makes from its own parts. Called on every build AND available to
 * tests with tampered packets — the guard must catch a hand-edited artifact, not only a buggy
 * builder. Returns a list of {code, sport, detail}; the builder throws when it is non-empty.
 */
export function packetContradictions(packet, { publicRouteSet }) {
  const out = [];
  const flag = (code, detail) => out.push({ code, sport: packet.sport, detail });

  // C1 · COUNT_DRIFT + PCT_HAND_WRITTEN — counts and percentage must recompute exactly.
  const proven = packet.stages.filter((s) => s.status === "PROVEN").length;
  const partial = packet.stages.filter((s) => s.status === "PARTIAL").length;
  const applicable = packet.stages.length;
  const c = packet.counts;
  if (c.applicable !== applicable || c.proven !== proven || c.partial !== partial ||
      c.unproven !== packet.stages.filter((s) => s.status === "UNPROVEN").length ||
      c.blocked !== packet.stages.filter((s) => s.status === "BLOCKED_EXTERNAL").length) {
    flag("COUNT_DRIFT", `counts do not recompute from the stage list (${JSON.stringify(c)})`);
  }
  const pct = applicable === 0 ? null : Math.round((proven / applicable) * 100);
  if (c.pct !== pct) flag("PCT_HAND_WRITTEN", `pct ${c.pct} != generated ${pct} — percentages are generated, never typed`);

  // C2 · TIER_VS_STAGES — the public tier must re-derive from the stage statuses.
  const stageMap = Object.fromEntries(packet.stages.map((s) => [s.id, { status: s.status }]));
  const tier = derivePublicTier(stageMap, { claimedRoutes: packet.publicClaims.routes });
  if (packet.publicClaims.tier !== tier) {
    flag("TIER_VS_STAGES", `tier ${packet.publicClaims.tier} does not derive from stages (expected ${tier}) — a page cannot promote a model`);
  }

  // C3 · PUBLIC_CLAIM_WITHOUT_SURFACE — routes claimed must be public-facing per the inventory,
  //      and a NOT_PUBLIC sport may not claim routes at all.
  for (const route of packet.publicClaims.routes) {
    if (!publicRouteSet.has(route)) flag("INTERNAL_ROUTE_IN_PUBLIC_CLAIMS", `${route} is not a public-facing route in the inventory`);
  }
  if (packet.publicClaims.tier === "NOT_PUBLIC" && packet.publicClaims.routes.length > 0) {
    flag("TIER_VS_STAGES", "NOT_PUBLIC sport claims public routes");
  }

  // C4 · ACTIVE_WITHOUT_CURRENT_RECEIPT — a product lane may say ACTIVE only with a dated receipt.
  for (const p of packet.products) {
    if (p.state === "ACTIVE" && !p.asOf) flag("ACTIVE_WITHOUT_CURRENT_RECEIPT", `${p.lane} claims ACTIVE with no receipt date`);
  }

  // C5 · SETTLED_WITHOUT_FROZEN — every settled row must trace to a frozen pre-event record.
  const st = packet.settlementSummary;
  if (st && st.settledRows != null && st.rowsWithFrozenForecast != null && st.settledRows > st.rowsWithFrozenForecast) {
    flag("SETTLED_WITHOUT_FROZEN", `${st.settledRows - st.rowsWithFrozenForecast} settled row(s) have no frozen pre-event record`);
  }

  // C6 · GREEN_WORKFLOW_WITHOUT_ARTIFACT — a run that succeeded must have produced its artifact.
  for (const w of packet.workflowReceipts ?? []) {
    if (w.lastRunConclusion === "success" && !w.artifactStamp) {
      flag("GREEN_WORKFLOW_WITHOUT_ARTIFACT", `${w.workflow} reports success with no produced-artifact stamp`);
    }
  }

  // C7 · STALE_CALIBRATION_COUNT — the learning artifact must agree with a fresh ledger recount.
  //      This is the "0 of 30 paired quoted while the artifact said 3" failure, made impossible to
  //      repeat quietly: a drifted count fails the control-plane build instead of shipping.
  const lc = packet.liveCalibration;
  if (lc?.artifactCounts && lc?.ledgerRecount) {
    if (lc.artifactCounts.graded !== lc.ledgerRecount.graded || lc.artifactCounts.pairedWithMarket !== lc.ledgerRecount.paired) {
      flag("STALE_CALIBRATION_COUNT",
        `learning artifact says ${lc.artifactCounts.graded} graded / ${lc.artifactCounts.pairedWithMarket} paired; the ledger recounts ${lc.ledgerRecount.graded} / ${lc.ledgerRecount.paired} — regenerate the learning report before quoting it`);
    }
  }

  return out;
}

/* ── The builder ──────────────────────────────────────────────────────────────────────────────── */

/**
 * @param {object} inputs
 * @param {Record<string, {inSeason?: boolean, stages: Record<string, {status: string, evidence?: string|null, blocker?: string|null}>}>} inputs.assessments
 * @param {Array<object>} inputs.tickets            open work-board tickets (derived; referenced by id, never re-invented)
 * @param {Array<object>} inputs.watches            reality-gated watches
 * @param {Array<object>} inputs.founderGates       shared-blocker registry rows {id, title, state, affectedSports?}
 * @param {Record<string, {state: string, detail: string, eventUtc?: string|null, artifactStamp?: string|null}>} inputs.currentEvents
 * @param {{date?: string, products?: Array<{product: string, label?: string, state: string}>}|null} inputs.productReceipt
 * @param {{routes: Array<{route: string, classification: string}>}} inputs.routeInventory
 * @param {Record<string, {settledRows?: number|null, rowsWithFrozenForecast?: number|null, source?: string}>} [inputs.settlementSummaries]
 * @param {Record<string, Array<{workflow: string, lastRunConclusion: string|null, artifactStamp: string|null}>>} [inputs.workflowReceipts]
 * @param {Record<string, {artifact: object|null, ledgerRecount: {graded: number, paired: number}|null}>} [inputs.calibrationAuthorities]
 * @param {Record<string, {state: string, asOf: string|null, source: string}>} [inputs.ladderReceipts]
 * @param {string} inputs.nowIso
 */
export function buildClosurePackets(inputs) {
  const {
    assessments, tickets = [], watches = [], founderGates = [],
    currentEvents = {}, productReceipt = null, routeInventory,
    settlementSummaries = {}, workflowReceipts = {}, calibrationAuthorities = {}, ladderReceipts = {}, nowIso,
  } = inputs;
  if (!nowIso) throw new Error("closure-packets: nowIso is an input, never a clock read");
  if (!routeInventory?.routes) throw new Error("closure-packets: route inventory is required — the leak guard cannot run without it");

  const publicRouteSet = new Set(
    routeInventory.routes.filter((r) => r.classification === "public" || r.classification === "product").map((r) => r.route),
  );

  /**
   * Product lanes per sport, quoted from TWO receipt families and never re-evaluated here: the
   * daily product receipt (bank-builder / moonshot / end-zone-vault — its own spelling, learned
   * the hard way when "endzone-vault" read RECEIPT_MISSING against a receipt that existed) and
   * each sport ladder's own published artifact, supplied by the sources layer.
   */
  const laneFor = (sport) => {
    const rows = productReceipt?.products ?? [];
    const mine = {
      mlb: ["bank-builder", "moonshot", "mlb-risk-ladder"],
      nfl: ["end-zone-vault"],
      epl: ["epl-ladder"],
      ufc: ["ufc-ladder"],
      nba: [],
    }[sport] ?? [];
    return mine.map((lane) => {
      const row = rows.find((p) => p.product === lane);
      if (row) return { lane, state: row.state, asOf: productReceipt?.date ?? null, source: "daily-product-receipt" };
      const ladder = ladderReceipts[sport];
      if (ladder && lane.endsWith("-ladder")) return { lane, state: ladder.state, asOf: ladder.asOf, source: ladder.source };
      return { lane, state: "RECEIPT_MISSING", asOf: null, source: null };
    });
  };

  const sports = {};
  const contradictions = [];

  for (const sport of RELEASE_TRAIN_ORDER) {
    const a = assessments[sport];
    if (!a) throw new Error(`closure-packets: no assessment for ${sport} — a registered sport cannot be silently absent`);

    const stages = GATE_STAGES.map((g) => {
      const s = a.stages[g.id] ?? { status: "UNPROVEN", evidence: null, blocker: null };
      const blockerClass = classifyBlocker(s);
      const ticket = tickets.find((t) => t.id === `stage-${sport}-${g.id}`) ?? null;
      return {
        id: g.id,
        name: g.name,
        status: s.status ?? "UNPROVEN",
        blockerClass,
        owner: blockerClass === "FOUNDER_DECISION" ? "FOUNDER" : blockerClass === "REALITY_GATED" ? "REALITY" : "ENGINEERING",
        acceptance: g.proof,
        lastAssessed: lastAssessedDate(s),
        ticketId: ticket?.id ?? null,
        nextAction: s.status === "PROVEN" ? null : (ticket?.nextAction ?? `land the receipt: ${g.proof}`),
      };
    });

    const counts = {
      applicable: stages.length,
      proven: stages.filter((s) => s.status === "PROVEN").length,
      partial: stages.filter((s) => s.status === "PARTIAL").length,
      unproven: stages.filter((s) => s.status === "UNPROVEN").length,
      blocked: stages.filter((s) => s.status === "BLOCKED_EXTERNAL").length,
    };
    counts.pct = counts.applicable === 0 ? null : Math.round((counts.proven / counts.applicable) * 100);

    const packet = {
      version: PACKET_VERSION,
      sport,
      generatedAt: nowIso,
      stages,
      counts,
      currentEvent: currentEvents[sport] ?? { state: "MISSING", detail: "no current-event reader supplied", eventUtc: null, artifactStamp: null },
      publicClaims: {
        tier: derivePublicTier(a.stages, { claimedRoutes: [...(SPORT_PUBLIC_ROUTES[sport] ?? [])] }),
        routes: [...(SPORT_PUBLIC_ROUTES[sport] ?? [])],
      },
      products: laneFor(sport),
      openTickets: tickets.filter((t) => t.sport === sport && t.owner === "ENGINEERING").map((t) => t.id),
      realityWatches: watches.filter((w) => w.sport === sport).map((w) => w.id),
      founderGates: founderGates
        .filter((b) => (b.affectedSports ? b.affectedSports.includes(sport) : false) || b.sport === sport)
        .map((b) => b.id),
      settlementSummary: settlementSummaries[sport] ?? null,
      workflowReceipts: workflowReceipts[sport] ?? [],
      /*
       * LIVE calibration counts, quoted FROM the sport's learning artifact with its own stamp —
       * never from an assessment's evidence string, which is dated prose. Guard C7 below refuses
       * the build when the artifact disagrees with a fresh ledger recount (P196 · Release D): a
       * stale count can no longer be quoted as current, because quoting it fails the build.
       */
      liveCalibration: calibrationAuthorities[sport]
        ? {
            source: "learning-artifact",
            generatedAt: calibrationAuthorities[sport].artifact?.generatedAt ?? null,
            artifactCounts: calibrationAuthorities[sport].artifact?.sample ?? null,
            ledgerRecount: calibrationAuthorities[sport].ledgerRecount ?? null,
          }
        : null,
      productionLinks: {
        publicRoutes: [...(SPORT_PUBLIC_ROUTES[sport] ?? [])],
        laneStatus: { mlb: null, epl: "/data/admin/epl-lane.json", nfl: "/data/admin/nfl-lane.json", ufc: "/data/admin/ufc-lane.json", nba: null }[sport],
      },
    };

    contradictions.push(...packetContradictions(packet, { publicRouteSet }));
    sports[sport] = packet;
  }

  if (contradictions.length > 0) {
    const detail = contradictions.map((c) => `[${c.sport}] ${c.code}: ${c.detail}`).join("\n  ");
    const err = new Error(`closure-packets: ${contradictions.length} contradiction(s) — the control plane refuses to build:\n  ${detail}`);
    err.contradictions = contradictions;
    throw err;
  }

  return { version: PACKET_VERSION, generatedAt: nowIso, sports, contradictions: [] };
}

/* ── The dependency-ordered execution queue ───────────────────────────────────────────────────── */

/**
 * Every ENGINEERING_READY gap, ordered by the release train and then by stage dependency order.
 * Reality-gated stages become watches, founder-gated stages join the founder queue — neither may
 * appear as "next engineering action", which is how a session ends up staring at a blocker it
 * cannot move (the anti-pattern §16 names). Shipped work simply stops appearing: the queue is a
 * pure function of the assessments, so there is nothing to tick off and nothing to forget.
 */
export function executionQueue(packetsResult) {
  const engineering = [];
  const realityWatch = [];
  const founderQueue = [];
  for (const sport of RELEASE_TRAIN_ORDER) {
    const p = packetsResult.sports[sport];
    for (const s of p.stages) {
      if (s.status === "PROVEN") continue;
      const item = {
        sport, stage: s.id, status: s.status, blockerClass: s.blockerClass,
        action: s.nextAction, acceptance: s.acceptance, ticketId: s.ticketId,
      };
      if (s.blockerClass === "ENGINEERING_READY") engineering.push(item);
      else if (s.blockerClass === "REALITY_GATED") realityWatch.push(item);
      else founderQueue.push(item);
    }
  }
  const rank = (x) => ORDER_RANK[x.sport] * 100 + STAGE_RANK[x.stage];
  engineering.sort((a, b) => rank(a) - rank(b));
  realityWatch.sort((a, b) => rank(a) - rank(b));
  founderQueue.sort((a, b) => rank(a) - rank(b));
  return {
    engineering: engineering.map((x, i) => ({ order: i + 1, ...x })),
    realityWatch,
    founderQueue,
  };
}
