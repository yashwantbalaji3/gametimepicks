/**
 * Endzone Vault — NFL touchdown-scorer intelligence product (Program 169 · Release G).
 *
 * NOT a renamed Moonshot, NOT a promise of profit: a paper-only, versioned research surface over
 * the TD engine with its OWN ledger (never blended into Bank Builder, Moonshot, or Mr. Dub's
 * protected record) and no forced card — NO_VAULT is a first-class daily outcome.
 *
 * Modes: TD_BOARD (all individually-eligible scorers, full probabilities visible) ·
 * RED_ZONE_SPOTLIGHT (3–5 strongest evidence-complete cases) · VAULT_CARD (optional 2–3 legs,
 * compatibility PROVEN) · GAME_STACK_LAB (dependence education, never independent legs) ·
 * NO_VAULT (honest hold). Same-game scorer pairs are correlated BY DEFAULT: without a joint
 * receipt from the shared simulation they are CORRELATION_NOT_VALIDATED and cannot enter the
 * card. Cross-game legs carry a DISCLOSED independence assumption. Payout size can never touch
 * a confidence field — price exists only in display/expected-payout space.
 */

export const END_ZONE_VAULT_VERSION = 1;
export const VAULT_MODES = Object.freeze(["TD_BOARD", "RED_ZONE_SPOTLIGHT", "VAULT_CARD", "GAME_STACK_LAB", "NO_VAULT"]);

/** Compatibility for a candidate leg set. Refusals are visible reasons, never silent drops. */
export function checkVaultCompatibility(legs, { jointReceipts = {} } = {}) {
  const errors = [];
  if (!Array.isArray(legs) || legs.length < 2 || legs.length > 3) errors.push(`a Vault Card is 2–3 legs (got ${legs?.length ?? 0})`);
  const players = new Set();
  for (const l of legs ?? []) {
    if (players.has(l.playerId)) errors.push(`duplicate player ${l.playerId} — hard-disabled`);
    players.add(l.playerId);
    if (l.side && l.side !== "YES") errors.push(`opposite/NO sides are not a Vault leg (${l.playerId})`);
    if (l.state !== "PUBLISHABLE") errors.push(`${l.playerId} is ${l.state} — only individually publishable scorers may combine`);
  }
  const byGame = new Map();
  for (const l of legs ?? []) {
    const k = l.providerEventId;
    byGame.set(k, [...(byGame.get(k) ?? []), l.playerId]);
  }
  for (const [game, ids] of byGame) {
    if (ids.length > 1 && !jointReceipts[game]) {
      errors.push(`same-game scorers ${ids.join("+")} are correlated by default — CORRELATION_NOT_VALIDATED without a joint receipt from the shared simulation`);
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    disclosure: byGame.size > 1 ? "cross-game legs carry an ASSUMED-INDEPENDENT disclosure — the product assumption is stated, not hidden" : null,
  };
}

/**
 * Build the daily Vault view from per-team scorer boards. Pure; the clock and date are inputs.
 * The ledger entry this returns is APPEND material — the caller writes it through the vault
 * ledger path only.
 */
export function buildVault({ boards, date, nowIso, jointReceipts = {} }) {
  const rows = (boards ?? []).filter((b) => b?.state === "BOARD").flatMap((b) =>
    b.rows.map((r) => ({ ...r, teamAbbr: b.teamAbbr, providerEventId: b.providerEventId })),
  );
  const refused = (boards ?? []).filter((b) => b?.state !== "BOARD").map((b) => ({ providerEventId: b?.providerEventId ?? null, reason: b?.reason ?? "board unavailable" }));
  const publishable = rows.filter((r) => r.state === "PUBLISHABLE").sort((a, b) => (b.modelProbability ?? 0) - (a.modelProbability ?? 0));

  const tdBoard = publishable.map((r) => ({ playerId: r.playerId, name: r.name, teamAbbr: r.teamAbbr, providerEventId: r.providerEventId, modelProbability: r.modelProbability, participation: r.participation, shareBasis: r.shareBasis }));
  const spotlight = publishable.slice(0, 5).filter((r) => Object.values(r.gates).every((g) => g === "PASS"));

  // Card: best-first greedy over publishable rows honoring compatibility; refusals recorded.
  let card = null;
  const cardRefusals = [];
  if (publishable.length >= 2) {
    const candidate = publishable.slice(0, 3).map((r) => ({ playerId: r.playerId, providerEventId: r.providerEventId, state: r.state, side: "YES" }));
    const compat = checkVaultCompatibility(candidate, { jointReceipts });
    if (compat.ok) card = { legs: candidate, disclosure: compat.disclosure };
    else cardRefusals.push(...compat.errors);
  } else {
    cardRefusals.push(`only ${publishable.length} individually publishable scorer(s) — a card needs 2–3`);
  }

  const state = tdBoard.length === 0 && !card ? "NO_VAULT" : card ? "ACTIVE" : "BOARD_ONLY";
  const noPlayReasons = state === "NO_VAULT"
    ? [...new Set([...refused.map((r) => r.reason), ...rows.filter((r) => r.state !== "PUBLISHABLE").flatMap((r) => Object.entries(r.gates).filter(([, g]) => g !== "PASS").map(([k, g]) => `${k}: ${g}`))])].slice(0, 6)
    : [];

  return {
    version: END_ZONE_VAULT_VERSION,
    date,
    generatedAt: nowIso,
    state,
    modes: {
      TD_BOARD: { count: tdBoard.length, rows: tdBoard },
      RED_ZONE_SPOTLIGHT: { count: spotlight.length },
      VAULT_CARD: card ?? { state: "NO_CARD", reasons: cardRefusals },
      GAME_STACK_LAB: { note: "educational dependence view — never presented as independent legs" },
    },
    refusedBoards: refused,
    noPlayReasons,
    ledgerEntry: { date, state: state === "ACTIVE" ? "ACTIVE" : "NO_PLAY", legs: card?.legs ?? [], modelVersion: END_ZONE_VAULT_VERSION, settlement: "PENDING_OFFICIAL_RESULT", reasons: state === "ACTIVE" ? [] : noPlayReasons },
    publicActivation: "OFF",
  };
}

/**
 * Correction lineage (Program 171 · Release C): a committed entry's REASONS can go stale (a
 * blocker resolves after the entry was written) but the entry never mutates — corrections
 * append to the entry's `corrections[]` with their own timestamps. State, legs, and the
 * original reasons are untouchable; unknown dates refuse.
 */
export function appendVaultCorrection(ledger, { date, at, note }) {
  const errors = [];
  if (ledger?.product !== "end-zone-vault") errors.push("wrong ledger — the Vault never writes into another product's record");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push("correction needs the entry date");
  if (!at || !Number.isFinite(Date.parse(at))) errors.push("correction needs its own timestamp");
  if (!note || String(note).trim().length < 10) errors.push("correction needs a substantive note (≥10 chars)");
  const idx = (ledger?.entries ?? []).findIndex((e) => e.date === date);
  if (idx === -1) errors.push(`no entry exists for ${date} — a correction can only annotate a real entry`);
  if (errors.length) return { ok: false, errors };
  const entries = ledger.entries.map((e, i) => (i === idx ? { ...e, corrections: [...(e.corrections ?? []), { at, note }] } : e));
  return { ok: true, ledger: { ...ledger, entries } };
}

/** Vault-ledger discipline: separate, versioned, append-only, never blended. */
export function validateVaultLedgerAppend(ledger, entry) {
  const errors = [];
  if (ledger?.product !== "end-zone-vault") errors.push("wrong ledger — the Vault never writes into another product's record");
  if (!entry?.date || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) errors.push("entry needs a date");
  if (!["ACTIVE", "NO_PLAY", "STALE", "INCIDENT"].includes(entry?.state)) errors.push(`entry state ${entry?.state} outside the closed set`);
  if ((ledger?.entries ?? []).some((e) => e.date === entry.date)) errors.push(`an entry for ${entry.date} already exists — append-only means corrections add lineage, never overwrite`);
  if (entry?.state === "ACTIVE" && (!Array.isArray(entry.legs) || entry.legs.length < 2)) errors.push("ACTIVE requires the card's legs");
  if (entry?.state !== "ACTIVE" && (entry?.legs ?? []).length > 0) errors.push("a NO_PLAY/STALE/INCIDENT entry carries no legs — no card is ever forced");
  return { ok: errors.length === 0, errors };
}
