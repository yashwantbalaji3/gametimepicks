/**
 * TRACK B PIPELINE — one NFL game from ledger rows to a reviewable draft.
 *
 *   select → enrich (receipt) → INTEGRITY GATE → fact bundle → render PNG → 2 captions → validate → publish bundle
 *
 * Pure orchestration of deterministic steps; no model, no network. The result is a DRAFT: nothing is approved or
 * published here. `inspectSlate` is what the Engineering role reports (every game on the slate, passed or refused,
 * with reasons); `buildRecapDraft` produces the deliverable for one game.
 */
import path from "node:path";
import { digestOf } from "../lib/util.mjs";
import { validateFactBundle, validateCaptionSet } from "../contracts/index.mjs";
import { loadNflLedger, groupGames, enrichCandidate, latestSettledSlate, slateGames, etDate } from "./select-game.mjs";
import { runIntegrityGate } from "./integrity-gate.mjs";
import { buildFactBundle, display } from "./fact-bundle-nfl.mjs";
import { templateCaptions } from "./captions.mjs";
import { validateCaption } from "./caption-validator.mjs";
import { renderPng } from "../render/render-png.mjs";

/** Gate every game of one Eastern date. Defaults to the latest date with a settled game ("last night"). */
export function inspectSlate({ repoRoot, date } = {}) {
  const ledger = loadNflLedger(repoRoot);
  const games = groupGames(ledger.rows);
  const slateDate = date ?? latestSettledSlate(games);
  const rows = slateGames(games, slateDate).map((g) => {
    const candidate = enrichCandidate(g, ledger, repoRoot);
    const verdict = runIntegrityGate(candidate);
    return { eventId: g.eventId, matchup: g.matchup, eventStart: g.eventStart, candidate, verdict };
  });
  return { ledger: { path: ledger.path, sha256: ledger.sha256 }, slateDate, games: rows };
}

/** Find one event (on any date) and enrich it. */
export function candidateFor(eventId, { repoRoot } = {}) {
  const ledger = loadNflLedger(repoRoot);
  const game = groupGames(ledger.rows).find((g) => g.eventId === String(eventId));
  if (!game) throw new Error(`event ${eventId} has no game rows in the ledger`);
  return { candidate: enrichCandidate(game, ledger, repoRoot), slateDate: etDate(game.eventStart) };
}

/**
 * @param {object} candidate   enriched candidate (from inspectSlate or candidateFor)
 * @param {{ outDir: string, accountId?: string, channel?: string, render?: boolean }} opts
 */
export async function buildRecapDraft(candidate, { outDir, accountId = "gametimepicks-x-unassigned", channel = "x", render = true }) {
  const verdict = runIntegrityGate(candidate);
  if (!verdict.pass) return { ok: false, verdict };

  const { bundle, digest: factBundleDigest } = buildFactBundle(candidate);
  const fb = validateFactBundle(bundle);
  if (!fb.ok) throw new Error(`fact bundle invalid: ${fb.errors.join(", ")}`);

  const media = render
    ? await renderPng(bundle, { outFile: path.join(outDir, `nfl-recap-${bundle.eventId}.png`) })
    : null;

  const { captionSet, digest: captionSetDigest } = templateCaptions(bundle, factBundleDigest);
  const cs = validateCaptionSet(captionSet);
  if (!cs.ok) throw new Error(`caption set invalid: ${cs.errors.join(", ")}`);
  const checks = captionSet.variants.map((v) => ({ id: v.id, ...validateCaption(v.text, bundle), chars: v.text.length }));

  /** One publish bundle per caption variant; the founder approves exactly one digest. */
  const publishBundles = captionSet.variants.map((v) => ({
    candidateId: bundle.eventId,
    channel,
    accountId,
    factBundleDigest,
    mediaDigest: media?.sha256 ?? "no-media",
    captionDigest: digestOf(v),
    captionId: v.id,
    contentKind: bundle.contentKind,
    snapshotId: bundle.snapshotId,
  }));

  return {
    ok: true,
    verdict,
    bundle,
    factBundleDigest,
    media,
    captionSet,
    captionSetDigest,
    captionChecks: checks,
    publishBundles: publishBundles.map((p) => ({ bundle: p, digest: digestOf(p) })),
    headline: `${display(bundle, "matchup")}: final ${bundle.teams.away.abbr} ${display(bundle, "final.away")}, ${bundle.teams.home.abbr} ${display(bundle, "final.home")}`,
  };
}
