/**
 * THE MLB INPUT SNAPSHOT — what a published forecast actually consumed.
 *
 * ── THE DEFECT THIS CLOSES ──────────────────────────────────────────────────────────────────────
 *
 * A committed simulation says `awayLineupSource: "confirmed"` and `awayLineupCount: 9`. It does not
 * say WHICH confirmed lineup, or WHEN it was captured, or WHO was in it — `players` is null by
 * design and the batting order is never written down. So a published forecast could not be
 * reconstructed from repository evidence even once that evidence was committed: you could see that
 * nine batters were used and never learn which nine.
 *
 * It mattered concretely. On 2026-09-25 gamePk 824706 read `confirmed / ready` at 20:37Z and
 * `prop-derived / unavailable` at 21:46Z, because the lineup input is ephemeral and one run found it
 * while the next did not. Nothing in either artifact distinguished the two inputs.
 *
 * ── WHY IT IS A SEPARATE ARTIFACT, NOT A FIELD ──────────────────────────────────────────────────
 *
 * `artifactHash` covers the whole game object, so adding provenance to `completeness` would change
 * every hash and ripple into the predictions layer that reads them. The brief is reproducibility,
 * not a new forecast. So the snapshot lives beside the forecast and the two are joined BOTH ways:
 * the snapshot is keyed by `(date, gamePk)` — which the forecast already carries — and it records
 * the forecast's own `artifactHash`. Either can find the other, and the published bytes are
 * unchanged.
 *
 * ── IT IS THE EVIDENCE, NOT A POINTER TO IT ─────────────────────────────────────────────────────
 *
 * The row carries the batting order that was simulated, by player id, so a forecast can be rebuilt
 * from the committed board plus this row alone. That matters because one of the two writers —
 * `mlb-lineup-refresh` — captures lineups in-run and deliberately does NOT commit them, on the
 * documented ground that two workflows committing one archive directory is how a capture gets
 * discarded in a rebase. A record that merely POINTED at that capture would cite evidence the
 * repository never kept.
 *
 * So `capturedAt` identifies the capture and the order reproduces the run without it. The capture
 * file, where it exists, is corroboration.
 *
 * ── AND IT RECORDS WHAT WAS CONSUMED, NOT WHAT IS AVAILABLE NOW ─────────────────────────────────
 *
 * Written by the generator from the inputs it just simulated, at the same instant, under the same
 * `--now`. Re-deriving it later from the archive would answer a different question — "what would we
 * use today" — and a late capture would silently make the snapshot disagree with the forecast it
 * claims to describe.
 */

/** Bump when the recorded shape changes in a way a reader must notice. */
export const INPUT_SNAPSHOT_VERSION = 1;

/**
 * One side's consumed lineup, compactly.
 *
 * Player ids only — the names, rates and slots are all recoverable from the committed capture this
 * points at, and duplicating them here would turn a provenance record into a second copy of the
 * evidence that could drift from it.
 */
function sideOf(lineup, confirmedSide, source, realCount, ratedCount) {
  return {
    source,
    /* The capture instant of the confirmed order actually used, or null when none was. This is the
       field the whole record exists for: it is what turns "confirmed" into a findable snapshot. */
    capturedAt: confirmedSide?.capturedAt ?? null,
    minutesToFirstPitch: confirmedSide?.minutesToFirstPitch ?? null,
    batterIds: (lineup ?? []).map((b) => (Number.isFinite(b?.playerId) ? b.playerId : null)),
    realCount,
    ratedCount,
    /* A padded slot is a replacement-level batter standing in for one nobody posted. Counted rather
       than named, because the count is the claim and the identity is in the capture. */
    paddedSlots: (lineup ?? []).filter((b) => !Number.isFinite(b?.playerId)).length,
  };
}

/**
 * Build one game's snapshot row from the input that was simulated and the artifact it produced.
 *
 * @param {object} args.input     the GameInput handed to simulateFullGame
 * @param {object} args.game      the published artifact game (for the back-link and its completeness)
 * @param {object} args.confirmed `{away, home}` ConfirmedSide as selected for this gamePk, or null
 */
export function snapshotRowFor({ input, game, confirmed }) {
  const c = input?.completeness ?? {};
  return {
    gamePk: input.gamePk,
    date: input.date,
    slug: game?.slug ?? input.slug,
    awayTeam: input.awayTeam,
    homeTeam: input.homeTeam,
    firstPitch: input.firstPitch ?? null,
    /* The back-link. A reader holding the forecast can verify it is looking at the right row, and a
       reader holding the row can find the forecast it describes. */
    artifactHash: game?.artifactHash ?? null,
    completenessLevel: c.level ?? null,
    startedBeforeGeneration: c.startedBeforeGeneration === true,
    away: sideOf(input.awayLineup, confirmed?.away, c.awayLineupSource ?? null, c.awayLineupCount ?? null, c.awayRatedCount ?? null),
    home: sideOf(input.homeLineup, confirmed?.home, c.homeLineupSource ?? null, c.homeLineupCount ?? null, c.homeRatedCount ?? null),
    /* A starter is identified, and whether the model had a strikeout projection for him — the
       difference between "we simulated Peterson" and "we simulated Peterson at a league rate". */
    awayStarter: starterOf(input.awayStarter),
    homeStarter: starterOf(input.homeStarter),
    missingFamilies: c.missingFamilies ?? [],
  };
}

function starterOf(s) {
  if (!s) return null;
  return { playerId: s.playerId ?? null, name: s.name ?? null, hasStrikeoutProjection: s.expStrikeouts != null };
}

/**
 * Fold this run's rows into the committed snapshot for the date.
 *
 * ⚠ A CARRIED-FORWARD FORECAST KEEPS ITS OWN SNAPSHOT. The generator freezes a started game's
 * pregame simulation byte-for-byte rather than regenerating it, so today's inputs describe a
 * forecast that was never published. Overwriting the row would make the record disagree with the
 * artifact it claims to describe — the exact failure it exists to prevent — so a row is replaced
 * only when its forecast's `artifactHash` says the forecast itself was rebuilt.
 */
export function foldSnapshot({ prior, rows }) {
  const byPk = new Map((prior?.games ?? []).map((g) => [g.gamePk, g]));
  let added = 0, updated = 0, carried = 0;

  for (const row of rows) {
    const existing = byPk.get(row.gamePk);
    if (!existing) { byPk.set(row.gamePk, row); added += 1; continue; }
    if (existing.artifactHash && row.artifactHash && existing.artifactHash === row.artifactHash) { carried += 1; continue; }
    byPk.set(row.gamePk, row);
    updated += 1;
  }

  return {
    games: [...byPk.values()].sort((a, b) => a.gamePk - b.gamePk),
    added, updated, carried,
  };
}

/**
 * Does every published forecast have a snapshot that describes IT?
 *
 * The reproducibility claim in one function: a forecast whose snapshot is missing cannot be
 * reconstructed, and a forecast whose snapshot records a different `artifactHash` is described by a
 * record of some other run.
 *
 * `startedBeforeGeneration` games are exempt from the hash check only when they carry no snapshot at
 * all AND produced no simulation — a refused game has no inputs to record.
 */
export function unreproducibleForecasts({ artifact, snapshot }) {
  const byPk = new Map((snapshot?.games ?? []).map((g) => [g.gamePk, g]));
  const out = [];
  for (const g of artifact?.games ?? []) {
    const row = byPk.get(g.gamePk);
    if (!row) { out.push({ gamePk: g.gamePk, slug: g.slug, why: "NO_SNAPSHOT" }); continue; }
    if (!row.artifactHash) { out.push({ gamePk: g.gamePk, slug: g.slug, why: "SNAPSHOT_HAS_NO_BACKLINK" }); continue; }
    if (row.artifactHash !== g.artifactHash) {
      out.push({ gamePk: g.gamePk, slug: g.slug, why: "SNAPSHOT_DESCRIBES_A_DIFFERENT_RUN", snapshot: row.artifactHash.slice(0, 12), forecast: String(g.artifactHash).slice(0, 12) });
    }
  }
  return out;
}
