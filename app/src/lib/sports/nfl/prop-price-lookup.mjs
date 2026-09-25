/**
 * THE ONE LOOKUP over captured NFL player-prop prices. Every producer that puts a price on a public
 * row reads it through here.
 *
 * WHY IT EXISTS. `build-nfl-weekly-boards.mjs` grew a private index over
 * `public/data/nfl/markets/latest.json`, and the game report and the Endzone Vault needed the same
 * prices. Three copies of a lookup is three chances to key it differently — and the P0 this file
 * belongs to began with exactly that failure one layer up, where two routes read the same artifact
 * and disagreed about what it said. A second implementation of a join is a second truth.
 *
 * ⚠ IT LOOKS UP. IT NEVER FETCHES, BLENDS, SUBSTITUTES OR NEAR-MATCHES. The capture owns which
 * sportsbook was chosen (lib/sports/odds/prop-display-selection.mjs) and publishes rows already
 * joined to durable player ids, each carrying its book and its capture instant. Absent file, absent
 * block, absent row, or a row missing its attribution ⇒ NO PRICE. A missing price is a state to be
 * stated, never a gap to be filled.
 *
 * ⚠ THE TWO ABSENCES ARE DIFFERENT FACTS. `NOT_OFFERED` means we asked this event's books and the
 * market was not posted. `NOT_PROBED` means we never asked about this event at all. Only the
 * capture knows which, via `probedEventIds`, so `pricingStateFor` answers it rather than each
 * consumer guessing — a consumer that guessed would assert a negative nobody measured.
 */

/**
 * A provider label reduced to a comparable key: lower case, no punctuation or accents, and with a
 * trailing generational suffix set aside — the same shape `lib/sports/nfl/player-identity.mjs`
 * compares on, and for the same measured reason (the books say "James Cook", ESPN says "James Cook
 * III"). It is used ONLY to pick a display state, never to attach a price.
 */
const nameKey = (n) => {
  const parts = String(n ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (parts.length >= 3 && /^(jr|sr|ii|iii|iv|v)$/.test(parts[parts.length - 1])) parts.pop();
  return parts.join(" ");
};

/*
 * ⚠ THERE IS NO TRANSPOSED-NAME MATCHING HERE, AND THAT IS A DECISION (2026-09-25).
 *
 * DraftKings and six other books post anytime touchdown for the San Francisco back they call
 * "James Jordan"; the roster calls him "Jordan James". A token-set key would collapse the two, and
 * briefly did — for the DISPLAY STATE only, never a join. The founder refused it, and the reason
 * holds: a generational suffix is a documented convention with one meaning, while an arbitrary
 * transposition is a guess that happens to look right, and the provider gives us nothing to check
 * it against. The Odds API's prop outcomes carry `description` (a name string), `name` (Over /
 * Under / Yes) and a price — NO stable player identifier — so there is no metadata that could
 * prove a unique alias. An evidence-backed alias mechanism is permitted; a heuristic is not, and
 * without provider ids we cannot build the former.
 *
 * So that row reads NOT_OFFERED. It is the wrong answer for one player, arrived at honestly, and
 * it is preferable to a rule that could silently attach a market to the wrong person.
 */

/** The families a board can ask about, spelled as the CAPTURE publishes them (board vocabulary). */
export const PROP_FAMILIES = ["anytime_td", "player_pass_yds", "player_rush_yds", "player_reception_yds", "player_receptions"];

/**
 * Build the index from an already-read markets artifact.
 *
 * Takes the parsed artifact rather than a path so a caller can pass a fixture, and so this module
 * never decides where the canonical capture lives — that is the producer's business.
 *
 * @param {object|null} markets the parsed `public/data/nfl/markets/latest.json`, or null
 */
export function buildPropPriceIndex(markets) {
  const idx = new Map();
  const pp = markets?.propPrices;
  if (pp?.rows?.length) for (const r of pp.rows) idx.set(`${r.canonicalEventId}|${r.playerId}|${r.family}`, r);

  const pm = markets?.propMarkets ?? {};
  /* Plural from the owner; the singular survives only for an artifact written before the sweep
     existed. A singular id on a 15-event sweep would call fourteen probed events "never asked". */
  const probed = new Set(pm.probedEventIds ?? (pm.probedEventId ? [pm.probedEventId] : []));

  /* Families this event's books were asked for and did not return. Carried so a caller can SAY
     which absence it is looking at; the displayed state is the same either way, and both are
     measured negatives, so nothing below branches on it. */
  const absentByEvent = new Map();
  /*
   * PROVIDER LABELS THIS EVENT PRICED AND THE CAPTURE COULD NOT SAFELY MAP.
   *
   * ⚠ IT IS A DISPLAY-STATE KEY AND NEVER A JOIN KEY. Matching a board row's NAME against these
   * labels chooses between two words on a screen — "we could not identify this market" versus "the
   * books did not post it" — and that is the entire extent of it. No price, no id and no team ever
   * travels this path, so nothing here can mint an identity; the capture's own resolver remains the
   * only thing that decides who a player is, and it stays fail-closed.
   *
   * Without it the two states collapse and a market the books DO post is reported as one they do
   * not — a confident public statement about a third party, caused by our own join.
   */
  const unresolvedByEvent = new Map();
  for (const e of pm.perEvent ?? []) {
    absentByEvent.set(e.canonicalEventId, new Set(e.absentMarkets ?? []));
    /*
     * nameKey -> Set(family), or null for a LEGACY capture whose entries are bare strings. Null
     * means "some family on this event, and the artifact cannot say which", which is exactly the
     * old over-broad behaviour — kept only so a carried-forward capture written before this change
     * still renders, never as the shape a new capture may write.
     */
    const fam = new Map();
    for (const u of e.unresolvedIdentities ?? []) {
      if (typeof u === "string") fam.set(nameKey(u), null);
      else if (u?.name) fam.set(nameKey(u.name), new Set(u.families ?? []));
    }
    unresolvedByEvent.set(e.canonicalEventId, fam);
  }

  return {
    meta: pp ? { referenceBook: pp.referenceBook, fallbackOrder: pp.fallbackOrder, policy: pp.policy, capturedAt: pp.capturedAt } : null,
    rowCount: idx.size,
    probedEventCount: probed.size,

    /** Was this event actually queried? The ONLY basis for claiming a market is not offered. */
    wasProbed: (providerEventId) => probed.has(`nfl-${providerEventId}`),

    /** Did the books return this family AT ALL for this event? Evidence for a report, not a state. */
    familyAbsentForEvent: (providerEventId, providerFamilyKey) =>
      absentByEvent.get(`nfl-${providerEventId}`)?.has(providerFamilyKey) ?? null,

    /**
     * The captured price for this EXACT player, family and event, in `FrozenMarket` shape — or null.
     * Never a near match, and never a price without a named book and a capture instant.
     */
    marketFor(providerEventId, playerId, family) {
      const r = idx.get(`nfl-${providerEventId}|${playerId}|${family}`);
      if (!r) return null;
      if (!r.sportsbook || !r.capturedAt) return null; // unattributed is not a price
      return r.shape === "YES_ONLY"
        ? { yesOdds: r.yesOdds, sportsbook: r.sportsbook, capturedAt: r.capturedAt }
        : { line: r.line, overOdds: r.overOdds, underOdds: r.underOdds, sportsbook: r.sportsbook, capturedAt: r.capturedAt };
    },

    /**
     * The typed absence for a row that has no price. Returns null when a price EXISTS, so a caller
     * cannot accidentally stamp both — the one defect this whole P0 is about.
     *
     * ⚠ `IDENTITY_UNRESOLVED` is NOT inferred here. It means a real market exists that we could not
     * safely map to this player, which is a fact only the capture's quarantine list holds; a
     * consumer seeing "no row for this player" cannot distinguish it from "no market", and guessing
     * would turn our own join failure into a claim about the books.
     */
    pricingStateFor(providerEventId, playerId, family, playerName = null) {
      if (this.marketFor(providerEventId, playerId, family)) return null;
      if (!this.wasProbed(providerEventId)) return "NOT_PROBED";
      /*
       * ⚠ IDENTITY_UNRESOLVED BEFORE NOT_OFFERED, because only one of them is a claim about the
       * books. If this event priced a label that matches this player's name and the capture could
       * not map it, the market EXISTS and we failed to reach it — saying "not offered" there is a
       * confident falsehood about a third party. Measured on 2026-09-25: eight players, including
       * James Cook, read "Not offered" for exactly this reason.
       */
      /*
       * ⚠ EVENT **AND FAMILY**. A flat per-event list made one unresolved anytime-touchdown label
       * turn that player's rushing yards and receptions into IDENTITY_UNRESOLVED as well — families
       * the books had genuinely not offered. Both sentences cannot be true, and the narrower one is
       * the only one the capture has evidence for.
       */
      if (playerName) {
        const fams = unresolvedByEvent.get(`nfl-${providerEventId}`)?.get(nameKey(playerName));
        if (fams !== undefined && (fams === null || fams.has(family))) return "IDENTITY_UNRESOLVED";
      }
      /* Probed and unpriced is NOT_OFFERED, whether the family came back absent for the whole event
         or came back without THIS player. Both are things we asked and were not given, which is
         what the word means; the difference between them is evidence, not a different claim. */
      return "NOT_OFFERED";
    },

    /**
     * The whole market slot for a row, as ONE value: either a price or a typed absence, never both.
     * Producers should use this rather than calling the two above and combining them by hand.
     */
    slotFor(providerEventId, playerId, family, playerName = null) {
      const market = this.marketFor(providerEventId, playerId, family);
      return market ? { market } : { pricingState: this.pricingStateFor(providerEventId, playerId, family, playerName) };
    },
  };
}
