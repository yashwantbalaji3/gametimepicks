/**
 * UFC forward-lineage classifier (Program 162 · Release D).
 *
 * Compares two committed card/bout captures and classifies what reality did between them. The
 * JOIN is stable-id only (providerBoutId / providerEventId — never name matching). FIELD
 * comparison inside a joined bout uses fighter provider ids when both captures carry them and
 * exact-string names otherwise (the forward shape often has null athlete ids); every change
 * records which `basis` it used, so a name-basis classification can never masquerade as an
 * id-proven one. Nothing here infers intent: a bout that vanished is REMOVED (the provider does
 * not say why), and CANCELLED is claimed only when a still-present bout's own status says so.
 *
 * Classes: EVENT_ADDED · EVENT_REMOVED · EVENT_DATE_CHANGE · ADDED · REMOVED · REPLACEMENT
 * (exactly one corner changed) · BOTH_CORNERS_CHANGED (review — a whole new pairing on a reused
 * id) · CORNER_SWAP (same pair, corners exchanged) · WEIGHT_CLASS_CHANGE · CANCELLED ·
 * STATUS_CHANGE · POSTPONED (bout date moved) · UNCHANGED. Pure module: no filesystem writes.
 */

export const UFC_LINEAGE_VERSION = 1;

export const LINEAGE_CLASSES = Object.freeze([
  "EVENT_ADDED", "EVENT_REMOVED", "EVENT_DATE_CHANGE",
  "ADDED", "REMOVED", "REPLACEMENT", "BOTH_CORNERS_CHANGED", "CORNER_SWAP",
  "WEIGHT_CLASS_CHANGE", "CANCELLED", "STATUS_CHANGE", "POSTPONED", "UNCHANGED",
]);

/** Corner identity for comparison: provider id when BOTH sides have one, else exact name. */
function corner(bout, side) {
  const id = bout[`${side}ProviderId`];
  const name = bout[side];
  return { id: id ?? null, name: name ?? null };
}
function sameFighter(a, b) {
  if (a.id != null && b.id != null) return { same: String(a.id) === String(b.id), basis: "provider-id" };
  return { same: a.name != null && a.name === b.name, basis: "exact-name" };
}

function indexBouts(capture, label, refusals) {
  const byId = new Map();
  for (const b of capture.bouts ?? []) {
    if (!b?.providerBoutId) { refusals.push({ capture: label, reason: "bout without providerBoutId — unjoinable rows classify nothing" }); continue; }
    if (byId.has(b.providerBoutId)) { refusals.push({ capture: label, providerBoutId: b.providerBoutId, reason: "duplicate providerBoutId inside one capture — identity broken, refuse both readings" }); byId.delete(b.providerBoutId); continue; }
    byId.set(b.providerBoutId, b);
  }
  return byId;
}

/** Classify prev → next. Pure; both inputs are committed capture artifacts. */
export function classifyUfcLineage(prev, next) {
  const refusals = [];
  const prevBouts = indexBouts(prev, "prev", refusals);
  const nextBouts = indexBouts(next, "next", refusals);
  const changes = [];

  // Events by stable id — additions/removals/date moves at the card level.
  const prevEvents = new Map((prev.events ?? []).map((e) => [e.providerEventId, e]));
  const nextEvents = new Map((next.events ?? []).map((e) => [e.providerEventId, e]));
  for (const [id, e] of nextEvents) if (!prevEvents.has(id)) changes.push({ class: "EVENT_ADDED", providerEventId: id, after: e.name });
  for (const [id, e] of prevEvents) if (!nextEvents.has(id)) changes.push({ class: "EVENT_REMOVED", providerEventId: id, before: e.name, note: "the provider does not say why — removal is the observation, cancellation is not inferred" });
  for (const [id, e] of nextEvents) {
    const p = prevEvents.get(id);
    if (p && p.dateUtc !== e.dateUtc) changes.push({ class: "EVENT_DATE_CHANGE", providerEventId: id, before: p.dateUtc, after: e.dateUtc });
  }

  for (const [id, b] of nextBouts) if (!prevBouts.has(id)) changes.push({ class: "ADDED", providerBoutId: id, after: `${b.red} vs ${b.blue} (${b.weightClass ?? "?"})` });
  for (const [id, b] of prevBouts) if (!nextBouts.has(id)) changes.push({ class: "REMOVED", providerBoutId: id, before: `${b.red} vs ${b.blue}`, note: "the provider does not say why — removal is the observation, cancellation is not inferred" });

  for (const [id, nb] of nextBouts) {
    const pb = prevBouts.get(id);
    if (!pb) continue;
    const boutChanges = [];

    const redCmp = sameFighter(corner(pb, "red"), corner(nb, "red"));
    const blueCmp = sameFighter(corner(pb, "blue"), corner(nb, "blue"));
    if (!redCmp.same || !blueCmp.same) {
      // Same pair with corners exchanged is presentation, not a replacement.
      const crossRed = sameFighter(corner(pb, "red"), corner(nb, "blue"));
      const crossBlue = sameFighter(corner(pb, "blue"), corner(nb, "red"));
      if (crossRed.same && crossBlue.same) {
        boutChanges.push({ class: "CORNER_SWAP", basis: crossRed.basis });
      } else if (!redCmp.same && !blueCmp.same) {
        boutChanges.push({ class: "BOTH_CORNERS_CHANGED", basis: redCmp.basis, before: `${pb.red} vs ${pb.blue}`, after: `${nb.red} vs ${nb.blue}`, note: "a reused bout id with a whole new pairing needs review, not automatic acceptance" });
      } else {
        const kept = redCmp.same ? pb.red : pb.blue;
        const out = redCmp.same ? pb.blue : pb.red;
        const inn = redCmp.same ? nb.blue : nb.red;
        boutChanges.push({ class: "REPLACEMENT", basis: (redCmp.same ? blueCmp : redCmp).basis, kept, out, in: inn });
      }
    }
    if ((pb.weightClass ?? null) !== (nb.weightClass ?? null)) boutChanges.push({ class: "WEIGHT_CLASS_CHANGE", before: pb.weightClass ?? null, after: nb.weightClass ?? null });
    if ((pb.statusRaw ?? null) !== (nb.statusRaw ?? null)) {
      boutChanges.push(/CANCEL/i.test(nb.statusRaw ?? "")
        ? { class: "CANCELLED", before: pb.statusRaw, after: nb.statusRaw }
        : { class: "STATUS_CHANGE", before: pb.statusRaw, after: nb.statusRaw });
    }
    if ((pb.dateUtc ?? null) !== (nb.dateUtc ?? null)) boutChanges.push({ class: "POSTPONED", before: pb.dateUtc, after: nb.dateUtc, note: "the date moved — direction and reason live with the provider, not this classifier" });

    if (boutChanges.length === 0) changes.push({ class: "UNCHANGED", providerBoutId: id });
    else for (const c of boutChanges) changes.push({ providerBoutId: id, ...c });
  }

  const counts = {};
  for (const cls of LINEAGE_CLASSES) counts[cls] = changes.filter((c) => c.class === cls).length;
  return {
    version: UFC_LINEAGE_VERSION,
    prevGeneratedAt: prev.generatedAt ?? null,
    nextGeneratedAt: next.generatedAt ?? null,
    changes,
    refusals,
    counts,
    reconciliation: {
      prevBouts: prevBouts.size,
      nextBouts: nextBouts.size,
      // every next bout is exactly one of: added, or joined (unchanged/changed rows reference it)
      exact: counts.ADDED + [...nextBouts.keys()].filter((id) => prevBouts.has(id)).length === nextBouts.size,
    },
  };
}
