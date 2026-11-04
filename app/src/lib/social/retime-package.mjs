/**
 * RE-TIME A PACKAGE. PURE. A founder schedule change (NBA Today 12:30 PM ET, 2026-11-04): same image, same caption, same
 * content, a new recommended time and an earlier close. That is a new revision, so the Command Center sees a new version
 * instead of SAME_CONTENT; contentSha256 is recomputed with buildSocialPackage's formula.
 */
import crypto from "node:crypto";

import { etLabel, socialPackageViolations } from "./social-package.mjs";

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
/** buildSocialPackage's fingerprint, for a package as stored. */
export const contentShaOf = ({ revision, snapshotRefs, caption, content, images, anomalyCheck, anomalies }) =>
  sha(JSON.stringify({ ...(revision > 1 ? { revision } : {}), snapshotRefs, caption, content, media: images.map((i) => i.sha256), ...(anomalyCheck ? { anomalyCheck, anomalies } : {}) }));

export function retimePackage(pkg, { recommendedAt, closesAt, rule }) {
  const [r, c] = [Date.parse(recommendedAt), Date.parse(closesAt)];
  if (!(r >= Date.parse(pkg.window.opensAt) && r < c && c <= Date.parse(pkg.window.closesAt))) throw new Error("the new slot must lie in the window, and the window may only close earlier");
  const iso = (ms) => new Date(ms).toISOString().replace(".000Z", "Z");
  const recommendedAtEt = etLabel(r), revision = (pkg.revision ?? 1) + 1;
  const out = {
    ...pkg, revision, window: { ...pkg.window, closesAt: iso(c) }, expiresAt: iso(c), recommendedAt: iso(r), recommendedAtEt,
    recommendation: { ...pkg.recommendation, recommendedAt: iso(r), recommendedAtEt, rule },
    freshness: { ...pkg.freshness, expiresAt: iso(c) },
    ...(pkg.sendWindow ? { sendWindow: { ...pkg.sendWindow, latestValidSendUtc: iso(c), latestValidSendEt: etLabel(c), governedBy: "FOUNDER_SCHEDULE" } } : {}),
    commandCenter: { ...pkg.commandCenter, suggestedPublishAt: iso(r) },
  };
  out.contentSha256 = contentShaOf(out);
  const v = socialPackageViolations(out);
  if (v.length) throw new Error(v.join("; "));
  return out;
}
