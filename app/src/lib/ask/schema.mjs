/**
 * ASK ARGUMENT SCHEMA — a deliberately tiny, closed validation language.
 *
 * MODEL OUTPUT IS UNTRUSTED INPUT (§57). A tool call arrives as JSON the model wrote, which means it
 * arrives with the same trust level as a query string: none. This validator runs on every call,
 * independently of whatever the provider's own "structured output" promised, because a provider
 * guarantee is a claim about a happy path and this is the boundary.
 *
 * WHY A HAND-ROLLED VALIDATOR RATHER THAN A LIBRARY. Two reasons, both structural. It adds no
 * dependency to a serverless function that currently has none, and — more importantly — the vocabulary
 * is CLOSED: there is no `any`, no free-form object, no pattern the caller supplies, and no escape
 * hatch that could be widened later by someone reaching for convenience. A schema language with no
 * expression evaluator cannot be talked into evaluating an expression.
 *
 * UNKNOWN KEYS ARE A REFUSAL, NOT A SHRUG (§12). Silently ignoring an argument the executor does not
 * understand is how `includePrivate: true` gets to look like it worked. Every unrecognised key fails
 * the call and names itself.
 */
import { ASK_ERROR } from "./contract.mjs";

const bad = (code, detail) => ({ ok: false, code, detail });

/** Field kinds. Adding one is a contract change and must come with its own tests. */
const KINDS = new Set(["string", "slug", "integer", "number", "boolean", "enum", "enumArray", "isoDate"]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Canonical identifiers only: no spaces, no punctuation that could reach a path or a URL. */
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;

/**
 * Validate and NORMALISE one argument object against a closed field spec.
 *
 * Returns the normalised value — never the caller's object — so a later stage cannot accidentally read
 * a key the validator rejected but left in place.
 */
export function validateArgs(spec, args) {
  if (args === null || args === undefined) args = {};
  if (typeof args !== "object" || Array.isArray(args)) return bad(ASK_ERROR.INVALID_ARGUMENT, "arguments must be an object");

  const allowed = new Set(Object.keys(spec));
  for (const key of Object.keys(args)) {
    if (!allowed.has(key)) return bad(ASK_ERROR.UNKNOWN_ARGUMENT, key);
  }

  const out = {};
  for (const [key, field] of Object.entries(spec)) {
    if (!KINDS.has(field.kind)) return bad(ASK_ERROR.INVALID_ARGUMENT, `${key}: unknown kind`);
    const raw = args[key];
    const absent = raw === undefined || raw === null || raw === "";

    if (absent) {
      if (field.required) return bad(ASK_ERROR.MISSING_ARGUMENT, key);
      if (field.default !== undefined) out[key] = field.default;
      continue;
    }

    const checked = checkOne(key, field, raw);
    if (!checked.ok) return checked;
    out[key] = checked.value;
  }
  return { ok: true, value: out };
}

function checkOne(key, field, raw) {
  switch (field.kind) {
    case "string": {
      if (typeof raw !== "string") return bad(ASK_ERROR.INVALID_ARGUMENT, `${key}: not a string`);
      const v = raw.trim();
      const max = field.maxLength ?? 200;
      if (v.length === 0 || v.length > max) return bad(ASK_ERROR.INVALID_ARGUMENT, `${key}: length`);
      return { ok: true, value: v };
    }
    case "slug": {
      if (typeof raw !== "string") return bad(ASK_ERROR.INVALID_ARGUMENT, `${key}: not a string`);
      const v = raw.trim();
      if (!SLUG.test(v)) return bad(ASK_ERROR.INVALID_ARGUMENT, `${key}: not a canonical id`);
      return { ok: true, value: v };
    }
    case "isoDate": {
      if (typeof raw !== "string" || !ISO_DATE.test(raw.trim())) return bad(ASK_ERROR.INVALID_ARGUMENT, `${key}: not YYYY-MM-DD`);
      const v = raw.trim();
      // A syntactically valid date that is not a real calendar date (2026-02-30) is still invalid.
      const d = new Date(`${v}T00:00:00Z`);
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
        return bad(ASK_ERROR.INVALID_ARGUMENT, `${key}: not a calendar date`);
      }
      return { ok: true, value: v };
    }
    case "integer": {
      if (typeof raw !== "number" || !Number.isInteger(raw)) return bad(ASK_ERROR.INVALID_ARGUMENT, `${key}: not an integer`);
      if (field.min !== undefined && raw < field.min) return bad(ASK_ERROR.INVALID_ARGUMENT, `${key}: below min`);
      if (field.max !== undefined && raw > field.max) return bad(ASK_ERROR.INVALID_ARGUMENT, `${key}: above max`);
      if (field.oneOf && !field.oneOf.includes(raw)) return bad(ASK_ERROR.INVALID_ARGUMENT, `${key}: not permitted`);
      return { ok: true, value: raw };
    }
    case "number": {
      if (typeof raw !== "number" || !Number.isFinite(raw)) return bad(ASK_ERROR.INVALID_ARGUMENT, `${key}: not a number`);
      if (field.min !== undefined && raw < field.min) return bad(ASK_ERROR.INVALID_ARGUMENT, `${key}: below min`);
      if (field.max !== undefined && raw > field.max) return bad(ASK_ERROR.INVALID_ARGUMENT, `${key}: above max`);
      return { ok: true, value: raw };
    }
    case "boolean": {
      if (typeof raw !== "boolean") return bad(ASK_ERROR.INVALID_ARGUMENT, `${key}: not a boolean`);
      return { ok: true, value: raw };
    }
    case "enum": {
      if (typeof raw !== "string") return bad(ASK_ERROR.INVALID_ARGUMENT, `${key}: not a string`);
      // Case is normalised because a model writes "mlb" and "MLB" interchangeably; the VALUE SET is not
      // widened, only the spelling of a member of it.
      const v = field.caseSensitive ? raw.trim() : raw.trim().toUpperCase();
      const options = field.caseSensitive ? field.options : field.options.map((o) => o.toUpperCase());
      const idx = options.indexOf(v);
      if (idx === -1) return bad(ASK_ERROR.INVALID_ARGUMENT, `${key}: not one of ${field.options.join("|")}`);
      return { ok: true, value: field.options[idx] };
    }
    case "enumArray": {
      if (!Array.isArray(raw)) return bad(ASK_ERROR.INVALID_ARGUMENT, `${key}: not an array`);
      const maxItems = field.maxItems ?? 4;
      if (raw.length === 0 || raw.length > maxItems) return bad(ASK_ERROR.INVALID_ARGUMENT, `${key}: length`);
      const out = [];
      for (const item of raw) {
        const one = checkOne(key, { kind: "enum", options: field.options, caseSensitive: field.caseSensitive }, item);
        if (!one.ok) return one;
        if (!out.includes(one.value)) out.push(one.value); // de-duplicated, order preserved
      }
      return { ok: true, value: out };
    }
    default:
      return bad(ASK_ERROR.INVALID_ARGUMENT, `${key}: unknown kind`);
  }
}

/**
 * Render a field spec as the JSON-Schema-ish description a provider's tool-calling API wants.
 *
 * Generated from the SAME spec the executor validates against, so the schema the model is shown and
 * the schema the server enforces cannot drift apart. Two hand-maintained copies is how a model ends up
 * being told about an argument that no longer exists.
 */
export function toProviderSchema(spec) {
  const properties = {};
  const required = [];
  for (const [key, field] of Object.entries(spec)) {
    const p = { description: field.describe ?? "" };
    switch (field.kind) {
      case "integer": p.type = "integer"; if (field.min !== undefined) p.minimum = field.min; if (field.max !== undefined) p.maximum = field.max; if (field.oneOf) p.enum = field.oneOf; break;
      case "number": p.type = "number"; if (field.min !== undefined) p.minimum = field.min; if (field.max !== undefined) p.maximum = field.max; break;
      case "boolean": p.type = "boolean"; break;
      case "enum": p.type = "string"; p.enum = [...field.options]; break;
      case "enumArray": p.type = "array"; p.items = { type: "string", enum: [...field.options] }; p.maxItems = field.maxItems ?? 4; break;
      case "isoDate": p.type = "string"; p.pattern = "^\\d{4}-\\d{2}-\\d{2}$"; break;
      default: p.type = "string"; if (field.maxLength) p.maxLength = field.maxLength; break;
    }
    properties[key] = p;
    if (field.required) required.push(key);
  }
  return { type: "object", properties, required, additionalProperties: false };
}
