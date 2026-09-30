import assert from "node:assert/strict";
import test from "node:test";

import { ASK_TOOL_NAMES } from "./registry.mjs";
import { ASK_SOURCE_LABEL } from "./source-labels.mjs";

test("every registry tool has a reader-facing source label — no function name in a chat bubble", () => {
  const missing = ASK_TOOL_NAMES.filter((t) => typeof ASK_SOURCE_LABEL[t] !== "string" || !ASK_SOURCE_LABEL[t].trim());
  assert.deepEqual(missing, [], `tools with no "Used:" label: ${missing.join(", ")}`);
  for (const label of Object.values(ASK_SOURCE_LABEL)) assert.doesNotMatch(label, /^[a-z]+[A-Z]/, `"${label}" is a function name, not a label`);
});
