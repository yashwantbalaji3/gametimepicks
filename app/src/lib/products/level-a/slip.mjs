/**
 * LEVEL A · THE MODEL-ONLY SLIP. PURE and client-safe (no node:, no file, no price, no provider data). A browser-local
 * list of public Level A legs a visitor collects across the Parlay Center, Bank Builder and Moonshot (and the sport hubs
 * that adopt <AddToSlip>), with the published model estimate ONLY where the leg's canonical source publishes one.
 *
 * It follows the Smart Betslip's design (lib/slip/smart-slip.mjs: pure functions, guarded storage, a leg cap, the React
 * surface owns the clock) but is its OWN list under its own key: the Smart Betslip is a price-comparison slip (every
 * leg carries a recorded price and its freshness), and a model leg has no price, so the two never share state.
 *
 * RULES (each has a test)
 *   · Storage key `gtp.slip.model.v1`; read and write are wrapped (private mode, blocked storage, quota) and a bad value
 *     reads as an empty slip. Never `gtp.slip.v1` (paper slip) or `gtp.slip.v2` (Smart Betslip).
 *   · A leg's identity is sport | event | market | outcome; adding one already in the slip changes nothing.
 *   · Flags per leg: the same event twice (DUPLICATE_EVENT), two different outcomes of one event (CONFLICTING_OUTCOME),
 *     the same team in another game of the same sport (SAME_TEAM; teams are sport-scoped, so one city's teams in two
 *     sports are not flagged), started (EXPIRED) or within the 30-minute publication cutoff (INSIDE_CUTOFF).
 *   · A combined model estimate and tier only when there are 2+ legs, every leg has a published estimate, the events
 *     are distinct (the shared engine's independentGames) and no leg is expired or inside the cutoff. Joint = product
 *     of the legs' published values; tier = the D2 band of the exact joint (tierForJoint); text = jointShownFor.
 *     Otherwise "No combined estimate" with the reason. A same-game correlation is never combined.
 *   · Model-only: no sportsbook price or payout anywhere; the copy text carries no link and no provider data. The slip
 *     says "model estimate", never "odds".
 *   · An empty slip is not stored: removing the last leg or "Clear all" deletes the storage entry.
 */
import { LEG_BOUNDS } from "../eligible-leg/contract.mjs";
import { PUBLIC_RISK_LABELS } from "../../parlays/risk-odds-bands.mjs";
import { jointShownFor, tierForJoint } from "./suggestions.mjs";
import { independentGames } from "./engine.mjs";

export const MODEL_SLIP_STORAGE_KEY = "gtp.slip.model.v1";
export const MODEL_SLIP_VERSION = 1;
export const MODEL_SLIP_MAX_LEGS = 12;
export const MODEL_SLIP_LABEL = "Model-only selection — no sportsbook prices or payout quoted";
export const SLIP_INDEPENDENCE = "Assumes the games are independent: every leg is a different game, but results can still be related, and that is not modelled.";
/** The Level A publication cutoff: the leg contract's own (30 minutes before start), the same gate levelALeg applies. */
export const SLIP_CUTOFF_MS = LEG_BOUNDS.activationCutoffMs;

export const LEG_FLAG = Object.freeze({
  DUPLICATE_EVENT: "Same game as another leg in this slip",
  CONFLICTING_OUTCOME: "Conflicts with another leg's outcome in the same game",
  SAME_TEAM: "Same team as another leg in this sport",
  EXPIRED: "Started: no longer a pre-game suggestion",
  INSIDE_CUTOFF: "Starts within 30 minutes: past the publication cutoff",
});

const norm = (s) => String(s ?? "").trim().toLowerCase();
export const slipLegKey = (l) => [norm(l?.sport), norm(l?.eventId), norm(l?.market), norm(l?.outcome?.code)].join("|");
const eventKey = (l) => `${norm(l?.sport)}|${norm(l?.eventId)}`;
const teamKeys = (l) => (l?.teams ?? []).map((t) => `${norm(l.sport)}|${norm(t)}`);
const isP = (x) => typeof x === "number" && Number.isFinite(x) && x > 0 && x < 1;

/** The only fields a slip leg may hold (anything else is dropped). */
export function toSlipLeg(x) {
  const e = x?.estimate ?? null;
  const leg = {
    sport: String(x?.sport ?? ""), eventId: String(x?.eventId ?? ""), eventLabel: String(x?.eventLabel ?? ""),
    teams: Array.isArray(x?.teams) ? x.teams.slice(0, 2).map(String) : [],
    market: String(x?.market ?? ""), outcome: { code: String(x?.outcome?.code ?? ""), label: String(x?.outcome?.label ?? "") },
    startUtc: typeof x?.startUtc === "string" ? x.startUtc : null, frozenAt: typeof x?.frozenAt === "string" ? x.frozenAt : null,
    estimate: e && isP(e.value) ? { value: e.value, text: String(e.text ?? ""), source: String(e.source ?? "") } : null,
    source: String(x?.source ?? ""),
  };
  return { ...leg, key: slipLegKey(leg) };
}

export const emptyModelSlip = () => ({ version: MODEL_SLIP_VERSION, legs: [] });

export function addSlipLegs(slip, legs) {
  let out = slip.legs;
  for (const raw of legs ?? []) {
    const l = toSlipLeg(raw);
    if (!l.sport || !l.eventId || out.some((x) => x.key === l.key) || out.length >= MODEL_SLIP_MAX_LEGS) continue;
    out = [...out, l];
  }
  return out === slip.legs ? slip : { ...slip, legs: out };
}
export const removeSlipLeg = (slip, key) => (slip.legs.some((l) => l.key === key) ? { ...slip, legs: slip.legs.filter((l) => l.key !== key) } : slip);
export const clearModelSlip = () => emptyModelSlip();
export function reorderSlipLeg(slip, from, to) {
  const n = slip.legs.length;
  const t = Math.max(0, Math.min(n - 1, to));
  if (from < 0 || from >= n || from === t) return slip;
  const legs = [...slip.legs];
  const [m] = legs.splice(from, 1);
  legs.splice(t, 0, m);
  return { ...slip, legs };
}

/** Per-leg flags and the combined estimate (or why there is none), at `nowMs`. */
export function modelSlipView(slip, { nowMs }) {
  const legs = slip.legs;
  const byEvent = new Map();
  for (const l of legs) byEvent.set(eventKey(l), [...(byEvent.get(eventKey(l)) ?? []), l]);
  const rows = legs.map((l) => {
    const flags = [];
    const same = byEvent.get(eventKey(l)) ?? [];
    if (same.length > 1) flags.push(same.some((o) => o !== l && o.market === l.market && o.outcome.code !== l.outcome.code) ? "CONFLICTING_OUTCOME" : "DUPLICATE_EVENT");
    const mine = new Set(teamKeys(l));
    if (legs.some((o) => eventKey(o) !== eventKey(l) && teamKeys(o).some((t) => mine.has(t)))) flags.push("SAME_TEAM");
    const t = Date.parse(l.startUtc ?? "");
    if (Number.isFinite(t) && Number.isFinite(nowMs)) {
      if (t <= nowMs) flags.push("EXPIRED");
      else if (t - nowMs < SLIP_CUTOFF_MS) flags.push("INSIDE_CUTOFF");
    }
    return { leg: l, flags, flagText: flags.map((f) => LEG_FLAG[f]) };
  });
  return { rows, combined: combinedEstimate(rows), label: MODEL_SLIP_LABEL };
}

function combinedEstimate(rows) {
  const none = (reason) => ({ available: false, reason });
  if (rows.length < 2) return none("add at least two legs from different games");
  const missing = rows.find((r) => !r.leg.estimate);
  if (missing) return none(`${missing.leg.outcome.label} has no published estimate`);
  if (rows.some((r) => r.flags.includes("CONFLICTING_OUTCOME") || r.flags.includes("DUPLICATE_EVENT"))) return none("two legs are from the same game");
  if (rows.some((r) => r.flags.includes("SAME_TEAM")) || !independentGames(rows.map((r) => r.leg))) return none("two legs involve the same team");
  const late = rows.find((r) => r.flags.includes("EXPIRED") || r.flags.includes("INSIDE_CUTOFF"));
  if (late) return none(`${late.leg.outcome.label} has started or starts within 30 minutes`);
  const joint = rows.reduce((p, r) => p * r.leg.estimate.value, 1);
  const tier = tierForJoint(joint);
  if (!tier) return { available: true, joint, tier: null, tierLabel: null, shown: `${(joint * 100).toFixed(1)}%`, note: "shorter than the Low band, so not tiered", disclosure: SLIP_INDEPENDENCE };
  return { available: true, joint, tier, tierLabel: PUBLIC_RISK_LABELS[tier], shown: jointShownFor(joint, tier), note: null, disclosure: SLIP_INDEPENDENCE };
}

/**
 * An Add button's words. A card's button, once all its legs are in, removes ALL of them, including a leg the visitor
 * added elsewhere (the slip does not record which button added a leg), so it says so: "Remove card (n legs)", and
 * its label names the effect. A single leg keeps "In slip · remove".
 */
export function slipButtonText({ inSlip, count, label = "Add to slip", name }) {
  if (!inSlip) return { text: label, aria: `${label}: ${name}` };
  if (count > 1) return { text: `Remove card (${count} legs)`, aria: `Remove this card's ${count} legs from the model slip, including any added elsewhere: ${name}` };
  return { text: "In slip · remove", aria: `Remove ${name} from the model slip` };
}

/** Copyable plain text: no link, no provider data, no price. */
export function modelSlipText(view) {
  const lines = [`GameTimePicks model slip · ${view.rows.length} leg${view.rows.length === 1 ? "" : "s"} · ${MODEL_SLIP_LABEL}`];
  for (const r of view.rows) {
    const l = r.leg;
    lines.push(`- ${l.eventLabel} (${l.sport.toUpperCase()}): ${l.outcome.label}${l.estimate ? ` · ${l.estimate.text}` : " · no published estimate"}${r.flags.length ? ` [${r.flagText.join("; ")}]` : ""}`);
  }
  const c = view.combined;
  lines.push(c.available ? `Combined model estimate ${c.shown}${c.tierLabel ? ` (${c.tierLabel})` : ` (${c.note})`}. ${c.disclosure}` : `No combined estimate: ${c.reason}.`);
  lines.push("Not a bet and not a price. Check any sportsbook's own line before acting.");
  return lines.join("\n");
}

export function parseModelSlip(raw) {
  try {
    const d = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!d || d.version !== MODEL_SLIP_VERSION || !Array.isArray(d.legs)) return emptyModelSlip();
    return addSlipLegs(emptyModelSlip(), d.legs);
  } catch { return emptyModelSlip(); }
}
export const serializeModelSlip = (slip) => JSON.stringify({ version: MODEL_SLIP_VERSION, legs: slip.legs.map(({ key, ...l }) => l) });
export function readModelSlip(storage) {
  try { return parseModelSlip(storage?.getItem(MODEL_SLIP_STORAGE_KEY) ?? null); } catch { return emptyModelSlip(); }
}
export function writeModelSlip(storage, slip) {
  try {
    if (slip.legs.length === 0) storage?.removeItem(MODEL_SLIP_STORAGE_KEY);
    else storage?.setItem(MODEL_SLIP_STORAGE_KEY, serializeModelSlip(slip));
    return true;
  } catch { return false; }
}
