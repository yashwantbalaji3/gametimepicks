/**
 * verify-deployment — state, do not infer, when production last built and from what.
 *
 * THE PROBLEM THIS REPLACES
 * Sprint 032 tried to answer "is production's clock current?" and found it unanswerable from
 * outside. Production served today's data, but that was equally explained by a human push
 * hours earlier carrying the data forward — every automated data commit ends in `[skip ci]`,
 * and whether the host honours that token is not observable from the public site. The only
 * available answers were guesses, and a guess about freshness is exactly what this codebase
 * refuses to ship.
 *
 * WHAT THIS DOES INSTEAD
 * Fetches the build marker that `build-info.mjs` now stamps into every export and reports
 * facts: the deployed commit, the deployed build's frozen ET clock, how old it is, and
 * whether it matches local HEAD. No claim is made that cannot be read off the response.
 *
 * FAIL CLOSED
 *   - marker missing (404 / pre-marker build) → UNKNOWN, never "healthy". A build that
 *     predates this script cannot report on itself, and pretending otherwise would recreate
 *     the blind spot.
 *   - unreachable / malformed → UNKNOWN. This is an observability tool; by default a network
 *     blip must not read as a deployment failure, so the plain run exits 0 and says so.
 *   - `--strict` (for CI gating) treats anything that is not a positively-measured current
 *     clock as failure — INCLUDING unknown. Unverified is not the same as fine, and a gate
 *     that passes on "we could not tell" is not a gate.
 *
 * Read-only over the network. Touches no files, no money, no data.
 *
 *   node scripts/verify-deployment.mjs [--url <origin>] [--strict] [--json]
 */
import { execFileSync } from "node:child_process";

const DEFAULT_ORIGIN = "https://gametimepicks.yashwantbalaji.com";
const MARKER_PATH = "/data/build-info.json";
const TIMEOUT_MS = 20_000;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const origin = (value("--url", process.env.GTP_SITE_URL || DEFAULT_ORIGIN) || "").replace(/\/+$/, "");
const strict = flag("--strict");
const asJson = flag("--json");

function etDate(d) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function daysBetween(fromIsoDate, toIsoDate) {
  const [fy, fm, fd] = fromIsoDate.split("-").map(Number);
  const [ty, tm, td] = toIsoDate.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

function localHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .trim()
      .slice(0, 8);
  } catch {
    return null;
  }
}

async function fetchMarker(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) return { error: `HTTP ${res.status}`, status: res.status };
    const text = await res.text();
    try {
      return { info: JSON.parse(text) };
    } catch {
      return { error: "response was not valid JSON" };
    }
  } catch (err) {
    return { error: err?.name === "AbortError" ? `timed out after ${TIMEOUT_MS}ms` : String(err?.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

const url = `${origin}${MARKER_PATH}`;
const { info, error, status } = await fetchMarker(url);
const today = etDate(new Date());
const head = localHead();

// ── UNKNOWN paths ──────────────────────────────────────────────────────────
if (error) {
  const preMarker = status === 404;
  const report = {
    status: "unknown",
    reason: preMarker ? "marker-not-deployed" : "unreachable",
    detail: error,
    url,
    checkedAt: new Date().toISOString(),
  };
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n  Deployment status: UNKNOWN\n`);
    console.log(`  ${url}`);
    console.log(`  → ${error}\n`);
    if (preMarker) {
      console.log("  Production has not yet deployed a build carrying the build marker.");
      console.log("  This is expected until the first deploy after Sprint 032 lands.");
      console.log("  Until then, the age of production's build clock is genuinely unknown —");
      console.log("  this tool will not guess at it.\n");
    } else {
      console.log("  Could not reach the marker. This says nothing about the deployment either\n" +
                  "  way; re-run when the network is available.\n");
    }
  }
  // Under --strict, "we could not tell" must not pass a gate.
  process.exit(strict ? 1 : 0);
}

// ── Measured paths ─────────────────────────────────────────────────────────
const buildEtDate = typeof info?.buildEtDate === "string" ? info.buildEtDate : null;
const builtAt = typeof info?.builtAt === "string" ? info.builtAt : null;
const deployedSha = info?.commit?.shortSha ?? null;
const behind = buildEtDate ? daysBetween(buildEtDate, today) : null;
const ageHours = builtAt ? (Date.now() - Date.parse(builtAt)) / 3_600_000 : null;

let clockStatus = "unknown";
if (behind !== null) {
  if (behind < 0) clockStatus = "future";
  else if (behind === 0) clockStatus = "current";
  else if (behind === 1) clockStatus = "yesterday";
  else if (behind < 7) clockStatus = "stale";
  else clockStatus = "very_stale";
}

const inSync = head && deployedSha ? head === deployedSha : null;

const report = {
  status: clockStatus,
  url,
  checkedAt: new Date().toISOString(),
  todayEt: today,
  deployed: {
    buildEtDate,
    builtAt,
    ageHours: ageHours === null ? null : Number(ageHours.toFixed(1)),
    sha: deployedSha,
    environment: info?.environment ?? null,
    commitMessage: info?.commit?.message ?? null,
  },
  local: { head },
  // null = undeterminable (missing sha on either side), not "false".
  shaInSync: inSync,
  daysBehind: behind,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const mark = clockStatus === "current" ? "OK" : clockStatus === "unknown" ? "UNKNOWN" : "BEHIND";
  console.log(`\n  Deployment status: ${mark}\n`);
  console.log(`  Site            ${origin}`);
  console.log(`  Today (ET)      ${today}`);
  console.log(`  Build clock     ${buildEtDate ?? "unknown"}${behind ? `  (${behind} day${behind === 1 ? "" : "s"} behind)` : ""}`);
  console.log(`  Built at        ${builtAt ?? "unknown"}${ageHours === null ? "" : `  (${ageHours.toFixed(1)}h ago)`}`);
  console.log(`  Deployed commit ${deployedSha ?? "unknown"}${info?.environment ? ` [${info.environment}]` : ""}`);
  if (info?.commit?.message) console.log(`                  ${info.commit.message}`);
  console.log(`  Local HEAD      ${head ?? "unknown"}`);
  if (inSync === true) console.log("\n  Production is serving local HEAD.");
  else if (inSync === false) console.log("\n  Production is serving a DIFFERENT commit than local HEAD.");
  else console.log("\n  Commit comparison unavailable (missing SHA on one side).");

  if (clockStatus !== "current" && clockStatus !== "unknown") {
    console.log(
      "\n  The deployed export's date-gated HTML is frozen at the build clock above.\n" +
        "  Client-side labels still self-correct, but server-rendered \"today\" sections do not.\n" +
        "  A rebuild is what fixes this — see .github/workflows/daily-rebuild.yml.\n",
    );
  } else {
    console.log("");
  }
}

if (strict && clockStatus !== "current") process.exit(1);
