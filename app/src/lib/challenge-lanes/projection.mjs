/**
 * CHALLENGE LANES · PUBLIC PROJECTION (`gtp.challenge-lane.public@1`). PURE and DETERMINISTIC: a function of the
 * private run logs only (no clock), serialized canonically, so a re-run writes identical bytes.
 *
 * PRICES ARE WITHHELD (founder blocker P1, SPEC §6). The repo is public and the only odds source's terms forbid public
 * price data, so nothing priced or price-derived is projected: no price, book, provider, fetch time, decimal, payout,
 * profit or price snapshot, and no tracked bankroll once a priced step has settled (it would reveal the price). Price
 * events appear only as `{ type, withheld: "P1" }`, without their hash. Model chances, legs, results, statuses and
 * post receipts are public.
 */
import { canonical, sha256, verifyChain } from "./chain.mjs";
import { LANES, MILESTONES, laneState, inPlay, publicStatusOf } from "./lanes.mjs";
import { publicLeg } from "./card-fields.mjs";
/* A card@2 (classified) card never carries its book line, price or line-dependent hit rates in the public file. */
const publicCard = (c) => (c?.classification ? { ...c, legs: c.legs.map(publicLeg), combined: undefined, money: undefined, reasons: undefined } : c);

export const LANE_PROJECTION_SCHEMA = "gtp.challenge-lane.public@1";
export const PUBLIC_PRICES = Object.freeze({ state: "WITHHELD_P1", note: "Payouts and prices are withheld until the founder approves a price source whose terms permit display (P1)." });
const PRICE_EVENTS = new Set(["PRICE_VERIFIED", "PAYOUT_COMPUTED"]);
/* v2-only fields are spread in only when present, so a v1 object is key-for-key what it was. */
const def = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** A receipt's image, only as a site path under /data/challenge-lanes/graphics/ (where the PNG lives is the renderer's call). */
export const IMAGE_PATH = /^\/data\/challenge-lanes\/graphics\/[a-z0-9][a-z0-9.-]*\.png$/;
const publicImagePath = (p) => (typeof p === "string" && IMAGE_PATH.test(p) && !p.includes("..") ? p : null);

/* The package fields an approval or post receipt shares (the console's receipt; its approver name stays private). */
const post = (e) => ({ packageId: e.packageId ?? null, approvedVersionSha256: e.approvedVersionSha256 ?? null, mediaIndex: e.mediaIndex ?? null, imageSha256: e.imageSha256 ?? null, scheduledFor: e.scheduledFor ?? null, refEventSha256: e.refEventSha256 ?? null });

function publicEvent(e, withheldMoney) {
  const head = { seq: e.seq, type: e.type, date: e.date ?? null, step: e.step ?? null, at: e.at, source: e.source };
  if (PRICE_EVENTS.has(e.type)) return { ...head, withheld: "P1", ...(e.type === "PAYOUT_COMPUTED" ? { result: e.result, refusals: e.refusals?.map((r) => r.code) ?? null } : {}) };
  switch (e.type) {
    case "RUN_STARTED": return { ...head, sha256: e.sha256, laneId: e.laneId, runId: e.runId, product: e.product, baseCents: e.baseCents, targetCents: e.targetCents, steps: e.steps, startedAt: e.startedAt, approvedBy: e.approvedBy, ...def({ ruleVersion: e.rulesVersion, maxLegs: e.rulesVersion ? e.maxLegs : undefined, stepTargetsCents: e.stepTargetsCents, supersedes: e.supersedes ?? undefined }) };
    case "CARD_FROZEN": return { ...head, sha256: e.sha256, packageId: e.packageId, mediaIndex: e.mediaIndex ?? null, suggestedCards: e.suggestedCards, card: publicCard(e.card) };
    case "STAKE_SET": return { ...head, withheld: withheldMoney ? "P1" : null, stakeCents: withheldMoney ? null : e.stakeCents, placedWager: e.placedWager };
    case "LEG_SETTLED": return { ...head, sha256: e.sha256, legId: e.legId, gameId: e.gameId, outcome: e.outcome, final: e.final, resultSource: e.source };
    case "STEP_SETTLED": return { ...head, sha256: withheldMoney ? null : e.sha256, outcome: e.outcome, bankrollAfterCents: withheldMoney ? null : e.bankrollAfterCents };
    case "STATUS": return { ...head, sha256: e.sha256, status: e.status, reason: e.reason ?? null, ...def({ code: e.code, nextRunId: e.nextRunId }) };
    case "GRAPHIC_RENDERED": return { ...head, sha256: e.sha256, packageId: e.packageId ?? null, imageSha256: e.imageSha256 ?? null, captionSha256: e.captionSha256 ?? null, rendererCommit: e.rendererCommit ?? null, imagePath: publicImagePath(e.imagePath) };
    case "APPROVED": return { ...head, sha256: e.sha256, ...post(e), approvedAt: e.approvedAt ?? null };
    case "RESTART_APPROVED": return { ...head, sha256: e.sha256, nextRunId: e.nextRunId ?? null, refEventSha256: e.refEventSha256 ?? null };
    case "POSTED": return { ...head, sha256: e.sha256, ...post(e), xPostId: e.xPostId ?? null, url: e.url ?? null, postedAt: e.postedAt ?? null };
    default: return { ...head, sha256: e.sha256 };
  }
}

function publicRun(events) {
  const s = laneState(events);
  /* bbm-rules@2 runs carry their own ladder (step targets), leg cap and rule version; a v1 run's bytes are unchanged
     (every v2-only field is undefined there, and canonical() drops undefined keys). */
  const v2 = events[0].rulesVersion ? { ruleVersion: events[0].rulesVersion, maxLegs: events[0].maxLegs, milestonesCents: events[0].stepTargetsCents } : null;
  const wins = events.filter((e) => e.type === "STEP_SETTLED" && e.outcome === "WIN").length;
  const withheldMoney = wins > 0; // a settled priced win makes the bankroll price-derived
  /* Pace vs the illustrative milestone of the steps already won (§2). Every number here comes from the bankroll, so it is
     withheld exactly when the bankroll is. */
  const remaining = Math.max(s.steps - s.step + 1, 0);
  const ladder = v2?.milestonesCents ?? MILESTONES[s.product];
  const milestone = wins > 0 ? ladder[Math.min(wins, s.steps) - 1] : s.baseCents;
  const pace = withheldMoney
    ? { withheld: "P1", milestoneCents: milestone, requiredMultiplier: null, behindByCents: null, onPace: null }
    : { withheld: null, milestoneCents: milestone, requiredMultiplier: !remaining || !(s.bankrollCents > 0) ? null : v2 ? Math.round((ladder[s.step - 1] / s.bankrollCents) * 1e4) / 1e4 : Math.round((s.targetCents / s.bankrollCents) ** (1 / remaining) * 1e4) / 1e4, behindByCents: Math.max(0, milestone - s.bankrollCents), onPace: s.bankrollCents >= milestone };
  const receiptsFor = (date) => events.filter((e) => ["GRAPHIC_RENDERED", "APPROVED", "POSTED"].includes(e.type) && e.date === date).map((e) => publicEvent(e, withheldMoney));
  return {
    runId: s.runId, startedAt: s.startedAt, approvedBy: s.approvedBy, headSha256: events.at(-1).sha256, eventCount: events.length,
    ...def({ ruleVersion: v2?.ruleVersion, maxLegs: v2?.maxLegs, milestonesCents: v2?.milestonesCents, supersedes: events[0].supersedes ?? undefined }),
    status: s.status, publicStatus: publicStatusOf(s), statusReason: s.statusReason, pace, step: s.step, steps: s.steps, stepText: `STEP ${Math.min(s.step, s.steps)} OF ${s.steps}`,
    inPlay: inPlay(s), stepsWon: wins,
    trackedBankrollCents: withheldMoney ? null : s.bankrollCents, trackedBankrollWithheld: withheldMoney ? "P1" : null,
    days: s.days.map((d) => ({
      date: d.date, step: d.step, status: d.status, reason: d.reason, staked: d.staked,
      card: publicCard(d.card), cardEventSha256: d.cardEventSha256 ?? null,
      legResults: d.card ? d.card.legs.map((l) => ({ legId: l.legId, outcome: d.legs[l.legId] ?? "PENDING" })) : [],
      modelCardResult: !d.card ? null : Object.values(d.legs).includes("LOSS") ? "LOSS" : d.card.legs.every((l) => d.legs[l.legId] === "WIN") ? "WIN" : "PENDING",
      stepOutcome: d.outcome ?? null, receipts: receiptsFor(d.date),
      ...def({ withdrawn: d.withdrawn || undefined }),
      ...(v2 ? { ruleVersion: v2.ruleVersion, legCount: d.card?.legs?.length ?? 0, maxLegs: v2.maxLegs, targetPayoutCents: v2.milestonesCents[d.step - 1] ?? null, targetPayoutLabel: "STEP TARGET", heldCode: events.filter((e) => e.type === "STATUS" && e.date === d.date).at(-1)?.code ?? null } : {}),
    })),
    events: events.map((e) => publicEvent(e, withheldMoney)),
  };
}

/** The public file for one lane from its runs (oldest first). Refuses a run whose chain does not verify. */
export function laneProjection(laneId, runs) {
  const L = LANES[laneId];
  for (const r of runs) { const v = verifyChain(r); if (!v.ok) throw new Error(`laneProjection: ${laneId} chain broken at ${v.seq} (${v.reason})`); }
  const pub = runs.map(publicRun);
  const cur = pub.at(-1) ?? null;
  const doc = {
    schema: LANE_PROJECTION_SCHEMA, laneId, product: L.product, slot: L.slot, baseCents: L.baseCents, targetCents: L.targetCents, steps: L.steps, maxLegs: L.maxLegs,
    label: "Tracked challenge · no real wager placed", projectionLabel: "MODEL PROJECTION", prices: PUBLIC_PRICES,
    milestonesCents: MILESTONES[L.product], milestonesNote: "Illustrative milestones after each step; founder-adjustable.",
    ...def({ ruleVersion: cur?.ruleVersion }),
    current: cur && { ...def({ ruleVersion: cur.ruleVersion }), runId: cur.runId, status: cur.status, publicStatus: cur.publicStatus, pace: cur.pace, statusReason: cur.statusReason, step: cur.step, stepText: cur.stepText, inPlay: cur.inPlay, trackedBankrollCents: cur.trackedBankrollCents, trackedBankrollWithheld: cur.trackedBankrollWithheld, headSha256: cur.headSha256 },
    runs: pub,
  };
  return { ...doc, contentSha256: sha256(canonical(doc)) };
}
export const verifyLaneProjection = (doc) => { if (doc?.schema !== LANE_PROJECTION_SCHEMA) return false; const { contentSha256, ...rest } = doc; return contentSha256 === sha256(canonical(rest)); };
export const serializeProjection = (doc) => `${canonical(doc)}\n`;
