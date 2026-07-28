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
};

export default nextConfig;
