import fs from "node:fs";
import path from "node:path";

/**
 * Bake the build marker into the bundle.
 *
 * `scripts/build-info.mjs --emit` runs first in `npm run build` and writes .build-info.json.
 * Reading it here (rather than recomputing) keeps ONE timestamp across the JSON marker and
 * the JS bundle — they describe the same instant, so they can never disagree.
 *
 * Absent file → empty env → `buildInfoFromEnv()` returns null → the app reports the build
 * clock as "unknown". That is the intended fail-closed path for `next dev` and for any build
 * that skips the emit step; it is never treated as "fresh".
 */
function buildInfoEnv() {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), ".build-info.json"), "utf8");
    const info = JSON.parse(raw);
    return {
      NEXT_PUBLIC_BUILD_AT: info.builtAt ?? "",
      NEXT_PUBLIC_BUILD_ET_DATE: info.buildEtDate ?? "",
      NEXT_PUBLIC_BUILD_SHA: info.commit?.shortSha ?? "",
      NEXT_PUBLIC_BUILD_ENV: info.environment ?? "",
    };
  } catch {
    return {};
  }
}

/**
 * GTP_NFL_THEATER_PUBLIC — the Simulation replay (Theater) section on /nfl/simulation/[eventId] (P242 narrow exception,
 * founder 2026-10-19). Defined into the bundle as "1" ONLY when the build environment sets exactly "1", else "0", so
 * the page's `if (process.env.GTP_NFL_THEATER_PUBLIC === "1")` is a compile-time constant and, OFF, webpack never adds
 * the section, its CSS or the island to the build. Default OFF; rollback = build without it.
 * Guarded by lib/simulation-theater/public-theater.test.mjs (source) and public-theater-export.test.mjs (out/).
 */
const theaterFlagEnv = () => ({ GTP_NFL_THEATER_PUBLIC: process.env.GTP_NFL_THEATER_PUBLIC === "1" ? "1" : "0" });

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { ...buildInfoEnv(), ...theaterFlagEnv() },
  // Use static export so we can serve from any host (Vercel, Netlify, S3).
  // The pipeline writes JSON into public/data/, which is bundled into the build.
  output: "export",
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  /*
   * STATIC-GENERATION WORKERS CAPPED AT 4 (Vercel incident 2026-10-14/15).
   *
   * Next 14 renders static pages with (cores − 1) workers — 7 on Vercel's 8-core / 16 GB Enhanced machine.
   * The build log of dpl_8LLRvH9ztE8Mc2PmLuyrUAUxUpB4 (PR #1089) shows memory at 15.51 G of 16.00 G at
   * "Generating static pages (2155/2874)", then no heartbeat for 44 minutes until the platform killed it at
   * 46m10s; five builds died the same way between 10-14 13:45Z and 10-15 02:57Z.
   * Measured locally on the same machine shape (8 cores, 16 GB), current main: swap-outs during the build fall
   * from 49,960–179,820 (7 workers) to 10,872 (4 workers) at no time cost (next build 139 s vs 138 s);
   * 2 workers removes swapping entirely but costs 19%. The export is byte-identical apart from build-instant
   * values (7,500/7,500 files). Guarded by src/lib/build-workers-cap.test.mjs.
   */
  experimental: { cpus: 4 },
};

export default nextConfig;
