/**
 * MLB FULL-GAME SIM — FROZEN PREGAME CARRY-FORWARD, PROVEN PER GAME (Session 10). PURE, no I/O.
 *
 * ⚠ THE BUG THIS REPLACES (found 2026-10-03, Division Series). The rerun kept a started game's last pregame
 * simulation only when the PRIOR FILE's `generatedAt` predated the game's first pitch. The first rerun after
 * first pitch carried the game correctly — and stamped the file with ITS OWN (post-pitch) `generatedAt`. The
 * second rerun then saw a "post-pitch" prior file, refused the carried game, and published it `unavailable`.
 * So every game that started before the day's last lineup refresh lost its frozen forecast on the second
 * refresh: CWS @ CLE (first pitch 17:00Z) was carried at 18:46Z and erased at 19:20Z; ATL @ LAD (20:00Z) was
 * carried at 20:02Z/21:40Z and erased at 22:15Z. `/live`, the game page and the predictions layer (derived from
 * this file) then said "No GameTime pregame forecast" for games that had one.
 *
 * THE FIX: the proof travels with the game. The artifact keeps a file-level ledger
 *   frozenPregame: { [gamePk]: { forecastGeneratedAt, artifactHash } }
 * written the first time a game is carried (from the prior file, which predated first pitch) and copied
 * forward unchanged. A prior game is carried when EITHER its file predates first pitch OR the ledger says its
 * forecast did — and the ledger entry is only honoured when its artifactHash still matches the game's bytes,
 * so a post-pitch simulation can never borrow an earlier entry. Per-game `artifactHash` and every published
 * game byte are unchanged; the ledger is a sibling of `games`.
 */

const isUnavailable = (g) => g?.completeness?.level === "unavailable" || g?.status === "unavailable";

/**
 * @param {{ games: object[], priorArtifact: object|null, startedPks: Set<any> }} o
 *   games        this run's freshly simulated games (started ones are refusals from the adapter)
 *   priorArtifact the committed artifact for the same date, or null
 *   startedPks   gamePks whose first pitch is at or before this run's instant
 * @returns {{ games: object[], carriedPks: Set<any>, frozenPregame: Record<string, {forecastGeneratedAt: string, artifactHash: string}> }}
 */
export function carryFrozenPregame({ games, priorArtifact, startedPks }) {
  const carriedPks = new Set();
  const frozenPregame = {};
  if (!priorArtifact?.games?.length) return { games, carriedPks, frozenPregame };
  const priorByPk = new Map(priorArtifact.games.map((g) => [g.gamePk, g]));
  const priorLedger = priorArtifact.frozenPregame ?? {};
  const out = games.map((g) => {
    if (!startedPks.has(g.gamePk)) return g;
    const prior = priorByPk.get(g.gamePk);
    if (!prior || isUnavailable(prior) || !g.firstPitch) return g;
    const fp = Date.parse(g.firstPitch);
    // (a) the prior FILE was written before first pitch — the original rule.
    const fileIsPregame = priorArtifact.generatedAt && Date.parse(priorArtifact.generatedAt) <= fp;
    // (b) the prior GAME was already carried, and the ledger proves when its forecast was made. The hash must
    //     match, so an entry can never vouch for different bytes than the ones it was written for.
    const entry = priorLedger[String(g.gamePk)];
    const ledgerIsPregame = entry
      && entry.artifactHash != null && entry.artifactHash === prior.artifactHash
      && Date.parse(entry.forecastGeneratedAt) <= fp;
    if (!fileIsPregame && !ledgerIsPregame) return g;
    carriedPks.add(g.gamePk);
    frozenPregame[String(g.gamePk)] = ledgerIsPregame
      ? { forecastGeneratedAt: entry.forecastGeneratedAt, artifactHash: entry.artifactHash }
      : { forecastGeneratedAt: priorArtifact.generatedAt, artifactHash: prior.artifactHash ?? null };
    return prior;
  });
  return { games: out, carriedPks, frozenPregame };
}
