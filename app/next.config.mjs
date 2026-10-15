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

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: buildInfoEnv(),
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
  /*
   * 2026-10-15 follow-up: with 4 workers the first Production build (dpl_FpJSaweMcmUE2yoSzNiNbX8UAKBb, bc0ac8b)
   * completed but peaked at 14.82G/16.00G (vs 15.51G stalled at 7) — 93%, too little margin. Memory rises ~8 G in
   * the last quarter of static generation (≈2 G per worker on the heaviest pages). 3 workers: local swap-outs 0,
   * next build 134 s (vs 121–139 s at 4–7). Estimated Vercel peak ≈ 12.8 G — an extrapolation, to be confirmed
   * from the next build log.
   */
  experimental: { cpus: 3 },
};

export default nextConfig;
