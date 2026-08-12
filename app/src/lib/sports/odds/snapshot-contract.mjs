/**
 * Multi-sport odds snapshot contract (Program 164 · Release 2).
 *
 * ONE odds path: this extends the proven MLB conventions (the-odds-api, dry-run default, credit
 * floor+ceiling, ODDS_API_KEY) to NFL/NBA/EPL/UFC behind ONE provider-neutral contract — it never
 * introduces a second provider or a second capture pattern.
 *
 * FAIL-CLOSED SECRET DISCIPLINE, executable:
 *   - missing key   → BLOCKED_EXTERNAL, zero network calls anywhere downstream;
 *   - malformed key → CONFIG_INVALID (shape only — the value is never logged, stored, or echoed;
 *                     the fingerprint is a length + last-4 only);
 *   - provider failure at capture time → SOURCE_STALE upstream, last-known-good stands.
 *
 * NO-VIG RULE: a two-way market de-vigs only when BOTH sides exist with valid prices; a one-sided
 * market REFUSES (quarantines) rather than inventing the missing side. Implied sums are recorded
 * pre-normalization so the vig itself stays visible (the Sprint-046 de-vig-first lesson).
 */

export const ODDS_CONTRACT_VERSION = 1;

/** the-odds-api sport keys for the four expansion sports — the only sports the canary accepts. */
export const ODDS_SPORT_KEYS = Object.freeze({
  nfl: "americanfootball_nfl",
  nba: "basketball_nba",
  epl: "soccer_epl",
  ufc: "mma_mixed_martial_arts",
});

/** Presence/shape check only. NEVER returns, logs, or embeds the value. */
export function classifyOddsSecret(env = {}) {
  const key = env.ODDS_API_KEY;
  if (!key || typeof key !== "string" || key.trim() === "") {
    return { state: "BLOCKED_EXTERNAL", reason: "ODDS_API_KEY absent — zero network calls may occur", fingerprint: null };
  }
  const t = key.trim();
  if (!/^[A-Za-z0-9]{16,64}$/.test(t)) {
    return { state: "CONFIG_INVALID", reason: "ODDS_API_KEY present but not key-shaped — refusing before any call", fingerprint: `len${t.length}` };
  }
  return { state: "PRESENT", reason: "key-shaped credential present (value never echoed)", fingerprint: `len${t.length}…${t.slice(-4)}` };
}

/** De-vig a two-way h2h market. Refuses one-sided or degenerate prices. */
export function noVigTwoWay(outcomes) {
  if (!Array.isArray(outcomes) || outcomes.length !== 2) {
    return { ok: false, reason: `expected exactly two outcomes, got ${outcomes?.length ?? 0} — a one-sided market never de-vigs` };
  }
  const [a, b] = outcomes;
  if (a.name && b.name && a.name === b.name) return { ok: false, reason: "duplicate outcome names — inversion/duplication defect, quarantined" };
  const imp = (price) => {
    if (typeof price !== "number" || !Number.isFinite(price)) return null;
    if (price >= 100) return 100 / (price + 100);          // american positive
    if (price <= -100) return -price / (-price + 100);      // american negative
    if (price > 1) return 1 / price;                        // decimal
    return null;
  };
  const pa = imp(a.price), pb = imp(b.price);
  if (pa == null || pb == null) return { ok: false, reason: "unparseable price — never guessed" };
  const sum = pa + pb;
  if (sum <= 1.0 || sum > 1.25) return { ok: false, reason: `implied sum ${sum.toFixed(4)} outside the sane vig band (1.0, 1.25] — stale, inverted, or corrupt` };
  return {
    ok: true,
    impliedSum: Number(sum.toFixed(6)),
    noVig: [
      { name: a.name, prob: Number((pa / sum).toFixed(6)) },
      { name: b.name, prob: Number((pb / sum).toFixed(6)) },
    ],
  };
}

/**
 * Normalize one provider event (the-odds-api shape) into contract rows. Total: one malformed
 * bookmaker/market quarantines itself, never the event batch.
 */
export function normalizeOddsEvent(raw, { sport, capturedAt, requestId }) {
  const rows = [];
  const quarantined = [];
  if (!raw?.id || !raw?.commence_time || !raw?.home_team || !raw?.away_team) {
    return { rows, quarantined: [{ reason: "event missing id/commence_time/participants — unjoinable, quarantined whole", providerEventId: raw?.id ?? null }] };
  }
  const scheduledStartUtc = raw.commence_time;
  for (const bk of raw.bookmakers ?? []) {
    for (const mkt of bk.markets ?? []) {
      if (mkt.key !== "h2h") { quarantined.push({ providerEventId: raw.id, bookmaker: bk.key, reason: `market ${mkt.key} outside contract v${ODDS_CONTRACT_VERSION} scope (h2h only) — recorded, never guessed into a row` }); continue; }
      const nv = noVigTwoWay(mkt.outcomes ?? []);
      if (!nv.ok) { quarantined.push({ providerEventId: raw.id, bookmaker: bk.key, reason: nv.reason }); continue; }
      rows.push({
        providerEventId: String(raw.id),
        sport,
        scheduledStartUtc,
        home: raw.home_team,
        away: raw.away_team,
        bookmaker: bk.key,
        marketType: "h2h",
        outcomes: mkt.outcomes.map((o) => ({ name: o.name, price: o.price })),
        impliedSum: nv.impliedSum,
        noVig: nv.noVig,
        capturedAt,
        sourceAsOf: bk.last_update ?? mkt.last_update ?? capturedAt,
        requestId,
      });
    }
  }
  return { rows, quarantined };
}

/** Validate a whole snapshot artifact. Population-exact; rights class mandatory and private. */
export function validateOddsSnapshot(artifact) {
  const errors = [];
  if (artifact?.dataClass !== "PRIVATE_RESEARCH") errors.push("dataClass must be PRIVATE_RESEARCH — odds snapshots never ship publicly");
  if (!ODDS_SPORT_KEYS[artifact?.sport]) errors.push(`unknown sport ${artifact?.sport}`);
  if (!Number.isFinite(Date.parse(artifact?.capturedAt ?? ""))) errors.push("capturedAt missing/unparseable");
  if (typeof artifact?.creditsUsed !== "number" || artifact.creditsUsed < 0) errors.push("creditsUsed must be recorded (the canary's accounting is part of the artifact)");
  if (!artifact?.requestId) errors.push("requestId missing — raw lineage is mandatory");
  const rows = artifact?.rows ?? [];
  const q = artifact?.quarantined ?? [];
  if (artifact?.sourceRows !== rows.length + q.length && typeof artifact?.sourceRows === "number") {
    errors.push(`population arithmetic broken: sourceRows ${artifact.sourceRows} ≠ ${rows.length} rows + ${q.length} quarantined`);
  }
  for (const r of rows) {
    if (Date.parse(r.sourceAsOf ?? "") > Date.parse(artifact.capturedAt)) { errors.push(`${r.providerEventId}/${r.bookmaker}: sourceAsOf after capturedAt — future-stamped price`); break; }
  }
  return { valid: errors.length === 0, errors };
}
