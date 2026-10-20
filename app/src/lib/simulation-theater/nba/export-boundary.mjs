/**
 * NBA SIMULATION THEATER · EXPORT BOUNDARY (integration 2026-10-19). Pure apart from reading the directory it is given.
 *
 * The NBA theater is a DEV-ONLY private candidate (/dev/simulation-theater/nba/[eventId], GTP_DEV_ROUTES=1). A default
 * build must ship nothing of it. scanExportForNbaPrivate(outDir) walks a static export and reports every file that
 * names the private engine, its artifact family or data path, the dev copy's sha256, or carries an NBA theater pack,
 * and whether a /dev/ tree survived the prune. export-boundary.test.mjs runs it on app/out after the build and proves
 * it on a planted leak.
 */
import fs from "node:fs";
import path from "node:path";

/** Literal markers of the private NBA candidate. Any one in any exported file is a leak. */
export const NBA_PRIVATE_MARKERS = Object.freeze([
  "nba-sim-v1-coherent", // the engine id
  "data/internal/research/nba", // the private data tree
  "experimental-v1", // the artifact family directory
  "c4612dc4e8ab924e6b1f1fc8af9c713d1494f5cf731c6719dbb34f9c8adcc261", // dev copy r2 (nba-sim-v1-real-2026-10-20-r2.json)
  "45df05d89d2d0eedd9214f5c5dfeb038aaf5740ba881b234fe660145e2cc3e11", // the superseded pre-rounding-fix dev copy
  // The committed private receipt the dev route reads since 2026-10-20 (loader.mjs NBA_THEATER_SOURCE): the file's bytes
  // at its first pre-tip window (a49d5bfaa9) and the write-once payloadSha256 of 401909088's receipt stamp. The path
  // markers above already cover every later version of the file.
  "06d14473c547d2194189b44b40862809d82ce3544487f9673311366a76f13984", // experimental-v1/forecasts/2026-10-20.json @ a49d5bfaa9
  "c130921d643a7167734ef4b4eb1b4b029f6e5bce194fec4f1ebadad9497d8c70", // 401909088 receipt payloadSha256
  // Projected Final Box Score (Lane A-NBA 2026-10-20). ASCII-only, so a minifier's escaping cannot hide them, and unique
  // to the NBA box score (an NFL box score never says PRIVATE CANDIDATE MODEL, never carries these attributes):
  "nba-box-score@", // box-score.mjs NBA_BOX_SCORE_SCHEMA
  "data-nba-boxscore", // NbaBoxScore.tsx dialog / table attributes (class names are NOT markers: CSS ships un-pruned)
  "PRIVATE CANDIDATE MODEL", // the box-score watermark's private-candidate clause
]);

/** A theater pack (`theater-pack@…`) whose sport is NBA, as JSON or JSON escaped inside an RSC payload string. */
const NBA_PACK = /theater-pack@[\s\S]{0,4000}?\\*"sport\\*"\s*:\s*\\*"nba\\*"|\\*"sport\\*"\s*:\s*\\*"nba\\*"[\s\S]{0,4000}?theater-pack@/;

const TEXT_EXT = /\.(html|txt|js|mjs|cjs|json|css|map|xml|svg|rsc|md|webmanifest)$/i;

/**
 * data/build-info.json records the deployed commit's subject line, so a commit that merely NAMES a marker (e.g. this
 * guard's own commit) would read as a leak. Only `message` fields are dropped there; every other field is still scanned.
 */
const BUILD_INFO = "data/build-info.json";
function withoutCommitMessages(body) {
  try {
    return JSON.stringify(JSON.parse(body), (key, value) => (key === "message" ? undefined : value));
  } catch {
    return body; // unparseable: scan it as-is
  }
}

/**
 * @param {string} outDir  a static export (app/out)
 * @returns {{ exists: boolean, files: number, devTree: boolean, leaks: { file: string, marker: string }[] }}
 */
export function scanExportForNbaPrivate(outDir) {
  const res = { exists: fs.existsSync(outDir), files: 0, devTree: false, leaks: [] };
  if (!res.exists) return res;
  res.devTree = fs.existsSync(path.join(outDir, "dev"));
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!e.isFile() || !TEXT_EXT.test(e.name)) continue;
      res.files++;
      const rel = path.relative(outDir, full).split(path.sep).join("/");
      const raw = fs.readFileSync(full, "utf8");
      const body = rel === BUILD_INFO ? withoutCommitMessages(raw) : raw;
      for (const m of NBA_PRIVATE_MARKERS) if (body.includes(m)) res.leaks.push({ file: rel, marker: m });
      if (body.includes("theater-pack@") && NBA_PACK.test(body)) res.leaks.push({ file: rel, marker: "theater pack with sport nba" });
    }
  };
  walk(outDir);
  return res;
}
