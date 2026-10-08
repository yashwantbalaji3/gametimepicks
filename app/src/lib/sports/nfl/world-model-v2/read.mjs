/**
 * Read the committed World Model V2 artifacts (app/public/data/nfl/world-model-v2/) for static pages. Fail closed: an
 * artifact is showable only if it is the expected artifact type, was generated before its kickoff, ran at least
 * 10,000 worlds, recorded zero invariant violations and has a simulation id. Anything else renders no page and no link.
 */
import fs from "node:fs";
import path from "node:path";

export const MIN_RUNS = 10000;

export function isShowable(a) {
  return Boolean(
    a && a.artifact === "nfl-world-model-v2-simulation" && a.simulationId && a.identity?.providerEventId &&
    Number(a.run?.runs) >= MIN_RUNS && a.diagnostics?.invariantViolations === 0 &&
    Date.parse(a.run?.generatedAt) < Date.parse(a.identity?.kickoffUtc),
  );
}

/** @param {string} publicDir the app's public/ directory */
export function readWorldModelArtifacts(publicDir) {
  const dir = path.join(publicDir, "data/nfl/world-model-v2");
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => /^\d+\.json$/.test(x)).sort()) {
    try {
      const a = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      if (isShowable(a) && `${a.identity.providerEventId}.json` === f) out.push(a);
    } catch { /* unreadable → not showable */ }
  }
  return out.sort((x, y) => x.identity.kickoffUtc.localeCompare(y.identity.kickoffUtc) || x.identity.providerEventId.localeCompare(y.identity.providerEventId));
}

export function worldModelArtifactFor(publicDir, eventId) {
  return readWorldModelArtifacts(publicDir).find((a) => a.identity.providerEventId === String(eventId)) ?? null;
}
