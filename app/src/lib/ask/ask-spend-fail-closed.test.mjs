import { test } from "node:test";
import assert from "node:assert/strict";

import { selectProvider } from "./provider.mjs";
import { askDisabled } from "../../../api/_ask-core.mjs";

test("PRODUCTION with no ASK_MODEL_PROVIDER refuses instead of billing whichever key is present", () => {
  for (const keys of [{ ANTHROPIC_API_KEY: "x" }, { OPENAI_API_KEY: "x" }, { GOOGLE_API_KEY: "x" }, { ANTHROPIC_API_KEY: "x", GOOGLE_API_KEY: "y" }]) {
    const r = selectProvider({ ...keys, VERCEL_ENV: "production" });
    assert.equal(r.ok, false, JSON.stringify(Object.keys(keys)));
    assert.match(r.detail, /ASK_MODEL_PROVIDER must name the provider in production/);
  }
  assert.equal(selectProvider({ ANTHROPIC_API_KEY: "x" }, { isProduction: true }).ok, false);
});

test("PRODUCTION with an explicit provider is unchanged", () => {
  assert.deepEqual(selectProvider({ ASK_MODEL_PROVIDER: "gemini", GOOGLE_API_KEY: "g", ANTHROPIC_API_KEY: "a", VERCEL_ENV: "production" }), { ok: true, provider: "gemini", model: null });
  assert.equal(selectProvider({ ASK_MODEL_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "a", VERCEL_ENV: "production" }).provider, "anthropic");
  assert.equal(selectProvider({ ASK_MODEL_PROVIDER: "gemini", VERCEL_ENV: "production" }).ok, false, "a named provider still needs its key");
});

test("outside production the documented fallback is unchanged (previews, local, CI)", () => {
  assert.equal(selectProvider({ ANTHROPIC_API_KEY: "x" }).provider, "anthropic");
  assert.equal(selectProvider({ GOOGLE_API_KEY: "x", VERCEL_ENV: "preview" }).provider, "gemini");
  assert.equal(selectProvider({}).ok, false);
});

test("the kill switch: off / no / disabled / 0 / false (any case, padded) are OFF; only a deliberate value is on", () => {
  for (const v of [undefined, "", " ", "0", "false", "FALSE", "off", "Off", "no", "NO", "disabled", " off "]) {
    assert.equal(askDisabled({ ASK_GAMETIME_ENABLED: v }), true, JSON.stringify(v));
  }
  for (const v of ["1", "true", "on", "yes"]) assert.equal(askDisabled({ ASK_GAMETIME_ENABLED: v }), false, v);
});
