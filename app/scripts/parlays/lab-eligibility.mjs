/**
 * WHICH SPORTS THE PARLAY LAB MAY PUBLISH — decided from evidence, every run.
 *
 * ── Why a gate rather than four copies of MLB ───────────────────────────────────────────────────
 * "Replicate MLB for the other sports" is the right instinct and the wrong implementation. MLB's
 * Lab does not rest on a validated model — that model was demoted to market-context after failing
 * its bar three times, and this stream's own backtest showed model edge does not predict leg
 * outcomes at all (58.1% / 59.2% / 57.9% across the edge buckets). What MLB's Lab actually rests on
 * is narrower and portable: REAL POSTED PRICES it can quote, and an OFFICIAL SOURCE it can grade
 * against. Any sport with both can carry a Lab stream on the same honest footing; any sport without
 * them cannot, however good its model looks.
 *
 * So eligibility is computed from the artifacts on disk rather than declared in a list a human
 * maintains. A sport goes live when the evidence is there and closes itself when it is not — which
 * also means a stale feed silently downgrades the sport instead of quietly publishing yesterday's
 * prices under today's heading.
 *
 * ── The three requirements ──────────────────────────────────────────────────────────────────────
 *   PRICES     a current, dated capture of real posted odds
 *   SETTLEMENT a proven official grading path, with rows to show for it
 *   DEPTH      enough independently-priced legs to build a card without reusing a game
 *
 * Note what is NOT required: a model that beats the market. None of ours does, and requiring one
 * would close every stream including MLB's. The Lab quotes prices and grades them; that is the
 * whole claim, and it is the same claim in every sport.
 */
import fs from "node:fs";
import path from "node:path";
import { SETTLEABLE_SPORTS } from "../../src/lib/parlays/multi-sport.mjs";

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const daysBetween = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/** How stale a price capture may be before the sport stops being publishable. */
const PRICE_MAX_AGE_DAYS = 3;
/**
 * Fewest DISTINCT PRICED GAMES a sport needs. Games, not selections — and the distinction is the
 * whole point.
 *
 * The first version of this counted priced selections and set the bar at six, which passed NFL on
 * 2 events × 5 consensus markets. But the ladder builds up to four cards whose legs never reuse a
 * game, so two games cannot fill it: the stream would publish one thin card and three "no card
 * today" boxes, which is worse than staying closed. Four games is the floor for two real cards.
 */
const MIN_GAMES = 4;

/**
 * Each sport declares only WHERE its evidence lives. Whether it is live is measured, never set.
 * Adding a sport is one entry — that is the replication the founder asked for, done once.
 */
const SOURCES = {
  mlb: {
    label: "MLB",
    prices: (root, date) => {
      const d = readJson(path.join(root, "mlb", "player-props", `${date}.json`));
      /* everCaptured/newestDate separate "not yet today" from "never" — see the reason logic. */
      let everCaptured = false, newestDate = null;
      try {
        const dated = fs.readdirSync(path.join(root, "mlb", "player-props")).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
        everCaptured = dated.length > 0;
        newestDate = dated.at(-1)?.slice(0, 10) ?? null;
      } catch { /* neither */ }
      return { at: d?.generatedAt ?? null, games: new Set((d?.props ?? []).map((p) => p.gameId)).size, everCaptured, newestDate };
    },
    settlement: (root) => {
      const dir = path.join(root, "mlb", "results");
      try { return { proven: fs.readdirSync(dir).length > 0, source: "MLB Stats API official box score" }; }
      catch { return { proven: false, source: null }; }
    },
  },
  nfl: {
    label: "NFL",
    prices: (root, date, now) => {
      const d = readJson(path.join(root, "nfl", "markets", "latest.json"));
      // One row per event, each carrying a consensus across several markets.
      const rows = d?.rows ?? [];
      /*
       * ONLY EVENTS THAT HAVE NOT KICKED OFF. This counted every row in the latest capture, so a
       * game that started overnight still counted as a priced game the ladder could build on. On
       * 2026-08-21 that put NFL at 5 when only 3 were still ahead — over the four-game minimum on
       * the strength of two matches already in progress — and it opened the cross-sport stream,
       * which needs two live sports.
       *
       * The freshness check above bounds when the CAPTURE happened, which is a different question
       * from whether there is anything left to bet on. "We captured prices recently" is not "there
       * are games."
       */
      const upcoming = rows.filter((r) => {
        const k = Date.parse(r.kickoffUtc ?? r.commenceTime ?? "");
        return Number.isFinite(k) && k > Date.parse(now);
      });
      return { at: d?.capturedAt ?? d?.generatedAt ?? null, games: new Set(upcoming.map((r) => r.canonicalEventId)).size };
    },
    /*
     * A RESULTS FILE IS NOT A SETTLER.
     *
     * This returned proven:true whenever nfl/results/latest.json had rows, and it does — so NFL
     * cleared the whole gate and was reported LIVE. settle-lab-cards has no NFL branch: an NFL leg
     * falls through to the MLB box-score path, boxFor() cannot resolve a gamePk it does not have,
     * and the leg records "pending" on every run forever. The card would publish, never grade, and
     * quietly never enter the record — so the Lab's hit rate would be computed over only the cards
     * that happened to be settleable, which is how a record flatters itself without anyone lying.
     *
     * The check is now the conjunction it always meant: official results ON DISK, and a grader that
     * can read them. Both halves are named separately in the reason so a reader can tell which one
     * is missing — "we have no results" and "we cannot grade them" are different problems with
     * different owners.
     */
    settlement: (root) => {
      const d = readJson(path.join(root, "nfl", "results", "latest.json"));
      const haveResults = (d?.rows ?? []).length > 0;
      const haveGrader = SETTLEABLE_SPORTS.includes("nfl");
      return {
        proven: haveResults && haveGrader,
        source: "official NFL final scores",
        blockedReason: haveResults && !haveGrader
          ? "official NFL final scores are captured, but settle-lab-cards implements no NFL grader — a published leg would never resolve and so would never enter the record"
          : undefined,
      };
    },
  },
  ufc: {
    label: "UFC",
    prices: (root, date, now) => {
      const d = readJson(path.join(root, "ufc", "odds-latest.json"));
      /*
       * The card must still be AHEAD. Individual bouts carry no time, so the gate is the card's own
       * slate date: once it has passed, a fresh-looking capture describes a card that already
       * happened. UFC was legitimately live when this was written (a card on 2026-08-22), and the
       * check exists so that stops being true by itself the day after rather than lingering until
       * the next capture overwrites it.
       */
      const slate = d?.event?.slateDate ?? null;
      const past = slate ? slate < String(now).slice(0, 10) : false;
      // A bout is a fight card's "game" — two legs from one bout are the same event twice.
      const games = past ? 0 : new Set((d?.bouts ?? []).map((b) => b.eventId)).size;
      return { at: d?.generatedAt ?? null, games, slateDate: slate };
    },
    settlement: (root) => {
      /*
       * P200: this read graded-moneylines-latest.json — the RETIRED moneyline era's grader, frozen
       * at zero rows since that model was retired unvalidated — so UFC stayed "unproven" while the
       * lab's OWN settler had graded real UFC legs from official results (08-22 card, in the
       * settled receipts and the 0-2 stream record). Settlement proof now reads the lab's own
       * settled receipts: a card leg this system settled IS the proof this system can settle one.
       */
      try {
        const dir = path.join(root, "parlays", "lab-settled");
        const proven = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).some((f) => {
          const rows = readJson(path.join(dir, f))?.cards ?? [];
          return rows.some((c) => (c.sport ?? c.stream) === "ufc");
        });
        return { proven, source: "official UFC bout results through the lab's own settled receipts", blockedReason: proven ? null : "no UFC card has settled through the lab yet — the first settled card is the receipt" };
      } catch { return { proven: false, source: null }; }
    },
  },
  epl: {
    label: "Premier League",
    /*
     * This was a stub returning zero, with the comment "no odds feed is ingested for EPL at all".
     * That was true when it was written. It stopped being true when the EPL odds receipt was
     * authorised and a capture started running, and it stopped being true for settlement on
     * 2026-08-21 when Arsenal v Coventry City became the first Premier League match this project
     * has ever graded. The gate was reporting NOT_ELIGIBLE for reasons that had expired — which is
     * not the gate being strict, it is the gate being blind.
     *
     * Connecting the sensor is not lowering the bar. EPL passes or fails on exactly the three
     * requirements every other sport is held to, computed from artifacts on disk, every run — and
     * it closes itself again the moment a feed goes stale or a slate empties.
     */
    prices: (root, date, now) => {
      const d = readJson(path.join(root, "soccer", "epl", "odds", "latest.json"));
      /*
       * ONLY FIXTURES THAT HAVE NOT KICKED OFF — the NFL lesson, which put that sport over the
       * four-game minimum on the strength of two matches already in progress. A capture is a
       * snapshot of a moment, and EPL clusters are hours apart, so a Saturday capture legitimately
       * describes matches that have since started. "We captured prices recently" is not "there are
       * games."
       */
      const upcoming = (d?.rows ?? []).filter((r) => {
        const k = Date.parse(r.kickoffIso ?? "");
        return Number.isFinite(k) && k > Date.parse(now);
      });
      return { at: d?.capturedAt ?? null, games: new Set(upcoming.map((r) => r.eventId)).size };
    },
    /*
     * The graded ledger, not merely the presence of a results file. It is the only artifact that
     * proves the WHOLE path ran: an official full-time result captured, joined to a pre-kickoff
     * record by canonical identity, graded through the settlement contract, and appended exactly
     * once. A directory with a file in it proves none of that.
     *
     * gradeEplLeg covers match_result and total_goals — precisely the two markets the authorised
     * capture ingests (h2h + totals), so every leg the Lab could build here is settleable. A guard
     * pins that correspondence rather than leaving it to be noticed later by an ungradeable card.
     */
    settlement: (root) => {
      const p = path.join(root, "soccer", "epl", "results", "graded-forecasts.jsonl");
      try {
        const rows = fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).length;
        return { proven: rows > 0, source: "official full-time results, graded through the EPL settlement contract" };
      } catch { return { proven: false, source: null }; }
    },
  },
};

/**
 * @returns per-sport eligibility, plus the multi-sport stream which opens only when two or more
 *          single-sport streams are live — a "multi-sport" card drawn from one sport is just a card.
 */
export function labEligibility(root, date, now) {
  const out = [];
  for (const [id, src] of Object.entries(SOURCES)) {
    const prices = src.prices(root, date, now);
    const settle = src.settlement(root, date);
    const ageDays = prices.at ? daysBetween(prices.at, now) : null;

    const reasons = [];
    /*
     * P200: "no odds capture is ingested for this sport" was ONE sentence for two different facts,
     * and the nightly ledger rebuild runs at ~04:12 ET — the one hour of the day when TODAY's
     * MLB props cannot exist yet (the morning generation writes them ~10:15 ET). Every morning
     * the public lab page therefore claimed MLB ingests no odds at all, beside an ACTIVE ladder
     * built from those very odds. The two facts get their own sentences: a sport whose captures
     * exist but not yet for THIS date is awaiting today's generation, not unserved. Whether it is
     * eligible RIGHT NOW is unchanged (no prices for today = not eligible right now) — only the
     * reason stops lying about the lane, and the ledger refresh after the morning generation
     * (daily-products) flips the state the same day.
     */
    if (!prices.at) {
      reasons.push(prices.everCaptured
        ? `no price capture for ${date} yet — the sport's own generation runs later in the day (newest capture ${prices.newestDate ?? "unknown"})`
        : "no odds capture is ingested for this sport");
    }
    else if (ageDays > PRICE_MAX_AGE_DAYS) reasons.push(`the last price capture is ${ageDays.toFixed(1)} days old`);
    /*
     * The SPECIFIC reason, when the source knows one. "No official settlement path has produced a
     * graded result yet" is the right sentence for a sport with no results on disk, and the wrong
     * one for NFL, which has plenty — what it lacks is a grader that can read them. A generic
     * blocker sends whoever reads it looking in the wrong place.
     */
    if (!settle.proven) reasons.push(settle.blockedReason ?? settle.source ?? "no official settlement path has produced a graded result yet");
    if (prices.games < MIN_GAMES) reasons.push(`only ${prices.games} priced game${prices.games === 1 ? "" : "s"} — a four-tier ladder needs at least ${MIN_GAMES} to build cards that never reuse one`);

    out.push({
      id, label: src.label,
      live: reasons.length === 0,
      blocked: reasons.length ? reasons.join("; ") : undefined,
      evidence: {
        pricedGames: prices.games,
        pricesCapturedAt: prices.at,
        priceAgeDays: ageDays == null ? null : Number(ageDays.toFixed(2)),
        settlementSource: settle.source,
        settlementProven: settle.proven,
      },
    });
  }

  /*
   * IDS, not labels.
   *
   * `liveSports` is consumed as a KEY — the cross-sport builder looks each entry up in its ladder
   * table — so returning display labels ("MLB", "UFC") meant every lookup missed and the lane
   * reported "legs from 0 sports" with two fully-built ladders sitting on disk. The same shape as
   * the registry keying soccer as "soccer" against a gate keying it "epl": a mismatch between two
   * spellings of the same thing, silent because the miss looks like absence.
   *
   * Labels are kept separately for the sentence below, which is the only place a human reads them.
   */
  const live = out.filter((s) => s.live);
  const liveSports = live.map((s) => s.id);
  const liveLabels = live.map((s) => s.label);
  out.push({
    id: "multi", label: "Multi-sport",
    live: liveSports.length >= 2,
    blocked: liveSports.length >= 2 ? undefined
      : `a cross-sport card needs two live sports; ${liveLabels.length === 1 ? `only ${liveLabels[0]} is` : "none is"} cleared`,
    evidence: { liveSports, liveLabels },
  });
  return out;
}
