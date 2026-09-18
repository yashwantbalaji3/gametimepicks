/**
 * CONVERSATION STATE — bounded, ephemeral, and owned by nobody but the request it arrived in.
 *
 * v1.6 stores NOTHING. No account, no database, no localStorage key, no server-side session. The
 * client holds the message list and sends a bounded slice with each turn; this module reduces that
 * slice into a small structured state and hands it back. When the tab closes, the conversation is
 * gone — including the bankroll, which is the point (§20, §74).
 *
 * WHY THE STATE IS STRUCTURED AND NOT A SUMMARY. The tempting reduction is "summarise the old turns
 * into a paragraph". That paragraph then enters the next prompt as prose, and prose in a prompt is
 * indistinguishable from evidence — a generated summary would become sports truth by the back door
 * (§21). So what carries forward is exactly four things: resolved canonical IDENTITIES, the user's own
 * stated wagering preferences, the last intent, and the evidence ids a follow-up might need. Facts
 * stay tool-owned and are re-fetched.
 *
 * ISOLATION. Every function here is pure and takes the whole conversation as an argument. There is no
 * module-level mutable state, so two concurrent requests cannot see each other's bankroll — which is
 * the concurrency test, and it passes by construction rather than by locking.
 */
import { ASK_BANKROLL, ASK_BUDGET, ASK_ERROR, ASK_RISK_PROFILES } from "./contract.mjs";

/**
 * @typedef {object} WageringPreferences
 * @property {number|null} entertainmentBankroll  the user's own figure, this conversation only
 * @property {("LOW"|"MEDIUM"|"HIGH"|"LONGSHOT")|null} riskProfile
 * @property {string[]} sports
 * @property {number|null} maxLegs
 */

/** Validate the client's message list. Model output is untrusted; so is client input. */
export function normaliseMessages(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, code: ASK_ERROR.MALFORMED_REQUEST, detail: "no messages" };

  const messages = [];
  for (const m of raw.slice(-ASK_BUDGET.maxConversationTurns)) {
    if (!m || typeof m !== "object") return { ok: false, code: ASK_ERROR.MALFORMED_REQUEST, detail: "malformed message" };
    const role = m.role === "assistant" ? "assistant" : m.role === "user" ? "user" : null;
    if (!role) return { ok: false, code: ASK_ERROR.MALFORMED_REQUEST, detail: "unknown role" };
    const text = typeof m.text === "string" ? m.text : typeof m.content === "string" ? m.content : "";
    if (!text.trim()) continue;
    if (text.length > ASK_BUDGET.maxUserMessageChars) return { ok: false, code: ASK_ERROR.REQUEST_TOO_LARGE, detail: "a message is too long" };
    messages.push({ role, text: text.trim() });
  }

  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return { ok: false, code: ASK_ERROR.MALFORMED_REQUEST, detail: "the last message must be from the user" };
  }
  return { ok: true, messages };
}

/**
 * Validate a client-supplied page context (§121).
 *
 * A contextual "Ask about this player" launch carries an id. That id is CLIENT INPUT and is checked for
 * shape here and for EXISTENCE by the entity resolver before anything uses it — a body can claim any
 * id, and an unvalidated one would let a crafted link make Ask talk about an entity the product never
 * published. Malformed context is dropped, not repaired.
 */
export function normaliseContext(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const pageType = ["team", "player", "matchup", "compare", "lab"].includes(raw.pageType) ? raw.pageType : null;
  if (!pageType) return null;

  const id = typeof raw.id === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(raw.id) ? raw.id : null;
  const sport = ["MLB", "NFL", "EPL", "UFC"].includes(String(raw.sport ?? "").toUpperCase()) ? String(raw.sport).toUpperCase() : null;
  // A Lab query is carried as its canonical search string and is bounded; it is re-parsed by the Lab's
  // own parser downstream, never trusted as a query object.
  const labQuery = typeof raw.labQuery === "string" && raw.labQuery.length <= 1024 ? raw.labQuery : null;

  if (!id && !labQuery) return null;
  return { pageType, id, sport, labQuery };
}

/** Parse the user's stated preferences out of the client's typed object. Never inferred from prose. */
export function normalisePreferences(raw) {
  const out = { entertainmentBankroll: null, riskProfile: null, sports: [], maxLegs: null };
  if (!raw || typeof raw !== "object") return out;

  const bankroll = Number(raw.entertainmentBankroll);
  if (Number.isFinite(bankroll) && bankroll >= ASK_BANKROLL.min && bankroll <= ASK_BANKROLL.max) {
    out.entertainmentBankroll = Math.round(bankroll * 100) / 100;
  }
  const risk = String(raw.riskProfile ?? "").toUpperCase();
  if (ASK_RISK_PROFILES.includes(risk)) out.riskProfile = risk;

  if (Array.isArray(raw.sports)) {
    out.sports = raw.sports.map((s) => String(s).toUpperCase()).filter((s) => ["MLB", "NFL", "EPL", "UFC"].includes(s)).slice(0, 4);
  }
  const legs = Number(raw.maxLegs);
  if (Number.isInteger(legs) && legs >= 2 && legs <= 10) out.maxLegs = legs;

  return out;
}

/**
 * Read a risk style and a bankroll out of what the user actually typed.
 *
 * Scoped hard: the phrase must LOOK like an answer to the preference question, not merely contain a
 * number. "$100, medium" is a preference; "he rushed for 100 yards" is not, and a naive number-grab
 * would turn the second into a bankroll. Only a currency-marked or explicitly-labelled figure counts.
 */
export function readPreferencesFromText(text, current) {
  const out = { ...current };
  const s = String(text ?? "").toLowerCase();

  if (!out.riskProfile) {
    for (const p of ASK_RISK_PROFILES) {
      if (new RegExp(`\\b${p.toLowerCase()}\\b`).test(s)) { out.riskProfile = p; break; }
    }
  }

  if (out.entertainmentBankroll == null) {
    const m = s.match(/(?:\$\s*([\d,]+(?:\.\d{1,2})?))|(?:\b([\d,]+(?:\.\d{1,2})?)\s*(?:dollars|bucks|bankroll|budget)\b)|(?:\bbankroll\b[^\d]{0,12}([\d,]+(?:\.\d{1,2})?))/);
    const n = Number(String(m?.[1] ?? m?.[2] ?? m?.[3] ?? "").replace(/,/g, ""));
    if (Number.isFinite(n) && n >= ASK_BANKROLL.min && n <= ASK_BANKROLL.max) out.entertainmentBankroll = n;
  }

  return out;
}

/**
 * Reduce a conversation into the bounded state the planner and writer receive.
 *
 * @param {{messages: Array, context?: object|null, preferences?: object|null, priorEntities?: Array}} input
 */
export function reduceConversation({ messages, context = null, preferences = null, priorEntities = [] }) {
  const question = messages[messages.length - 1].text;

  let wagering = normalisePreferences(preferences);
  // The user's own words can supply a preference too — they usually answer the clarification in prose
  // rather than by tapping a control.
  wagering = readPreferencesFromText(question, wagering);

  const resolvedEntities = [];
  const seen = new Set();
  // Context first: a contextual launch is the most specific identity the turn has.
  if (context?.id && context.pageType && context.pageType !== "lab") {
    resolvedEntities.push({ id: context.id, kind: context.pageType === "matchup" ? "game" : context.pageType, sport: context.sport, label: null, fromContext: true });
    seen.add(context.id);
  }
  for (const e of priorEntities ?? []) {
    if (!e?.id || seen.has(e.id)) continue;
    seen.add(e.id);
    resolvedEntities.push(e);
    if (resolvedEntities.length >= 6) break;
  }

  /*
   * PRIOR TURNS ARE CARRIED AS THEIR TEXT, CAPPED, AND ONLY THE USER'S.
   *
   * Assistant prose is dropped from what the planner sees. It was generated from evidence that has
   * since been discarded, so re-reading it invites the planner to treat a previous ANSWER as a source —
   * exactly the "generated summary becomes truth" failure this design exists to avoid. The user's own
   * turns are kept because they carry intent, and the resolved identities carry the facts.
   */
  const history = messages
    .slice(0, -1)
    .filter((m) => m.role === "user")
    .slice(-4)
    .map((m) => m.text.slice(0, 300));

  return {
    question,
    history,
    context,
    wagering,
    resolvedEntities,
    /* Numbers the USER themselves supplied, so the verifier does not flag the bankroll they typed. */
    userNumbers: [wagering.entertainmentBankroll, wagering.maxLegs].filter((n) => typeof n === "number"),
  };
}

/**
 * Entities worth carrying into the NEXT turn, harvested from this turn's evidence.
 *
 * This is what makes "now compare him with Travis Kelce" work without re-resolving "him" by fuzzy
 * guess: the canonical id established this turn travels forward, and the follow-up starts from an
 * exact identity rather than from a name (§78).
 */
export function harvestEntities(envelopes) {
  const out = [];
  for (const env of envelopes ?? []) {
    if (env.tool === "resolveEntity" && env.data?.entity) out.push({ ...env.data.entity, fromContext: false });
    if (env.tool === "getPlayerRecentGames" && env.data?.player) out.push({ id: env.data.player.id, kind: "player", sport: env.arguments?.sport ?? null, label: env.data.player.label });
    if (env.tool === "runPlayerResearchQuery" && env.data?.player) out.push({ id: env.data.player.id, kind: "player", sport: env.arguments?.sport ?? null, label: env.data.player.label });
  }
  const seen = new Set();
  return out.filter((e) => (e?.id && !seen.has(e.id) ? (seen.add(e.id), true) : false)).slice(0, 6);
}

/** Clearing a conversation clears ALL of it. Asserted by a test rather than assumed (§141). */
export function clearedState() {
  return { question: "", history: [], context: null, wagering: normalisePreferences(null), resolvedEntities: [], userNumbers: [] };
}
