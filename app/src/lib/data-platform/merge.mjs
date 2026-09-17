/**
 * Field-level precedence merge — "whichever file loaded last" is never a rule.
 *
 * Several committed sources can describe the same canonical entity (an MLB game appears in the finals
 * archive, a schedule capture and a board). Each contributes a candidate tagged with its source key; for
 * every field the FIRST source in that field's precedence list that has a non-null value wins. A lower-
 * precedence source holding a DIFFERENT non-null value is receipted as a conflict (field, entity, both
 * values, chosen owner). Values are never averaged, blended or guessed.
 *
 * Aliases are unioned (then validated by the alias engine). Candidates arrive in any order; the result is
 * independent of that order.
 */
import { stableStringify } from "./stable-json.mjs";

/**
 * @param {{ kind: string, sportId: string, fields: string[], precedence: Record<string, string[]>, defaultPrecedence: string[] }} spec
 */
export function createMerger(spec) {
  /** @type {Map<string, Map<string, {fields: Record<string, unknown>, aliases: Array<{provider:string, entityType:string, id:string}>, occurrences: number}>>} */
  const byId = new Map();

  const orderOf = (field) => spec.precedence[field] ?? spec.defaultPrecedence;

  return {
    /**
     * @param {string} id canonical id @param {string} sourceKey @param {Record<string, unknown>} fields
     * @param {Array<{provider:string, entityType:string, id:string}>} [aliases]
     */
    add(id, sourceKey, fields, aliases = []) {
      if (!spec.defaultPrecedence.includes(sourceKey) && !Object.values(spec.precedence).some((l) => l.includes(sourceKey))) {
        throw new Error(`${spec.kind}: source ${sourceKey} has no precedence rank — add it to the precedence table`);
      }
      const perSource = byId.get(id) ?? new Map();
      const cur = perSource.get(sourceKey);
      if (!cur) perSource.set(sourceKey, { fields: { ...fields }, aliases: [...aliases], occurrences: 1 });
      else {
        cur.occurrences += 1;
        // The same source seen twice (e.g. a game in two capture files): keep the first non-null per field,
        // but a disagreement WITHIN one source family is still a conflict worth seeing.
        for (const [k, v] of Object.entries(fields)) {
          if (cur.fields[k] == null) cur.fields[k] = v;
          else if (v != null && stableStringify(cur.fields[k]) !== stableStringify(v)) {
            cur.withinSourceConflicts = [...(cur.withinSourceConflicts ?? []), { field: k, kept: cur.fields[k], other: v }];
          }
        }
        cur.aliases.push(...aliases);
      }
      byId.set(id, perSource);
    },
    has(id) { return byId.has(id); },
    ids() { return [...byId.keys()]; },
    /** @returns {{ records: Array<{id:string, fields: Record<string, unknown>, aliases: any[], sources: string[]}>, conflicts: any[] }} */
    finalize() {
      const records = [];
      const conflicts = [];
      for (const [id, perSource] of byId) {
        const fields = {};
        const fieldSources = {};
        for (const field of spec.fields) {
          const order = orderOf(field);
          let chosen = null;
          for (const src of order) {
            const c = perSource.get(src);
            if (!c || c.fields[field] == null) continue;
            if (!chosen) { chosen = { src, value: c.fields[field] }; continue; }
            if (stableStringify(chosen.value) !== stableStringify(c.fields[field])) {
              conflicts.push({ kind: spec.kind, sportId: spec.sportId, id, field, chosen, other: { src, value: c.fields[field] }, rule: `precedence ${order.join(" > ")}` });
            }
          }
          fields[field] = chosen ? chosen.value : null;
          fieldSources[field] = chosen ? chosen.src : null;
        }
        for (const [src, c] of perSource) {
          for (const w of c.withinSourceConflicts ?? []) {
            conflicts.push({ kind: spec.kind, sportId: spec.sportId, id, field: w.field, chosen: { src, value: w.kept }, other: { src, value: w.other }, rule: "first occurrence within one source" });
          }
        }
        const seen = new Set();
        const aliases = [];
        for (const c of perSource.values()) {
          for (const a of c.aliases) {
            const k = `${a.provider}|${a.entityType}|${a.id}`;
            if (!seen.has(k)) { seen.add(k); aliases.push(a); }
          }
        }
        aliases.sort((a, b) => (`${a.provider}|${a.entityType}|${a.id}` < `${b.provider}|${b.entityType}|${b.id}` ? -1 : 1));
        records.push({ id, fields, fieldSources, aliases, sources: [...perSource.keys()].sort() });
      }
      return { records, conflicts };
    },
  };
}

/**
 * Label picker — for display labels (team/player names), which legitimately change over time
 * ("Oakland Athletics" → "Athletics"). The label observed at the LATEST date wins; ties break by source
 * rank, then by code-unit order. Every distinct label is kept as a variant for the receipt. Labels never
 * participate in identity.
 */
export function createLabelPicker(sourceRanks) {
  /** @type {Map<string, Map<string, {date:string, rank:number}>>} */
  const byId = new Map();
  return {
    /** @param {string} id @param {string|null|undefined} label @param {string|null|undefined} date ISO date/instant or null @param {string} sourceKey */
    add(id, label, date, sourceKey) {
      if (typeof label !== "string" || label.trim() === "") return;
      const rank = sourceRanks.indexOf(sourceKey);
      if (rank < 0) throw new Error(`label source ${sourceKey} has no rank`);
      const m = byId.get(id) ?? new Map();
      const cur = m.get(label.trim());
      const d = date ?? "";
      if (!cur || d > cur.date || (d === cur.date && rank < cur.rank)) m.set(label.trim(), { date: d, rank });
      byId.set(id, m);
    },
    /** @returns {string|null} */
    pick(id) {
      const m = byId.get(id);
      if (!m) return null;
      return [...m].sort((a, b) => (b[1].date > a[1].date ? 1 : b[1].date < a[1].date ? -1 : a[1].rank - b[1].rank || (a[0] < b[0] ? -1 : 1)))[0][0];
    },
    variants(id) {
      return [...(byId.get(id)?.keys() ?? [])].sort();
    },
  };
}
