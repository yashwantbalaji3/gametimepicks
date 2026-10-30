/**
 * FOUNDER REVISIONS — what the founder asked to change on an imported graphic, for Launch Readiness to act on. Pure.
 *
 * A revision is the existing `revise` decision on a post; its note carries the structure, so the request lives in the
 * ledger with the content item and needs no new record kind. Launch Readiness reads the derived request file and returns
 * a new version under the same dedupeId, which keeps the post and its history together.
 */
export const REVISION_TYPES = Object.freeze({
  visual: { label: "Visual", handling: "Re-render and visual verification only. No model build, no paid capture." },
  caption: { label: "Caption", handling: "Keep every fact and disclosure accurate. No re-render unless the image text changes." },
  data: { label: "Data", handling: "Route through the canonical forecasting and verification pipeline. Never change a number for appearance." },
  line: { label: "Sportsbook line", handling: "Use a valid observed quote with its source and timestamp. No new capture without founder approval." },
});
export const REVISION_SCOPES = Object.freeze({ image: "This graphic", template: "The shared template" });

export const revisionNote = ({ scope = "image", type = "visual", image = "all", text }) => `[revision scope=${scope} type=${type} image=${image}] ${String(text ?? "").trim()}`;
const NOTE = /^\[revision scope=(\S+) type=(\S+) image=(\S+)\]\s*([\s\S]*)$/;
/** A note written before this structure existed reads as a visual request on the whole package. */
export function parseRevisionNote(note) {
  const m = String(note ?? "").match(NOTE);
  return m ? { scope: m[1], type: m[2], image: m[3], text: m[4] } : { scope: "image", type: "visual", image: "all", text: String(note ?? "") };
}

/** Every revision on imported posts. `posts` in ledger order. COMPLETED once a newer version of the same content arrived. */
export function revisionRequests(posts, status = {}) {
  const imported = posts.filter((p) => p.package?.imported);
  const out = [];
  imported.forEach((p, i) => {
    if (p.resolution?.verdict !== "revise") return;
    const m = p.package.imported;
    const n = parseRevisionNote(p.resolution.note);
    const newer = imported.slice(i + 1).find((q) => q.package.imported.dedupeId === m.dedupeId);
    out.push({
      requestId: p.decisionId, dedupeId: m.dedupeId, postId: p.postId, contentType: m.contentType, variant: m.variant ?? null,
      eventId: p.package.eventId ?? null, slateDate: p.package.date, title: p.package.title,
      version: { contentSha256: p.package.contentKey, designVersion: m.designVersion ?? null, template: p.package.template, images: p.package.mediaSet.map((x) => x.sha256) },
      scope: n.scope, type: n.type, image: n.image, request: n.text, handling: REVISION_TYPES[n.type]?.handling ?? REVISION_TYPES.visual.handling,
      forecast: { dataCommit: p.package.dataCommit ?? null, snapshotId: m.snapshotId ?? null, snapshotRefs: m.snapshotRefs ?? [] },
      requestedAt: p.resolution.approvedAt, status: newer ? "COMPLETED" : status[m.dedupeId]?.status === "IN_PROGRESS" ? "IN_PROGRESS" : "PENDING", revisedIn: newer?.decisionId ?? null,
    });
  });
  return out;
}
