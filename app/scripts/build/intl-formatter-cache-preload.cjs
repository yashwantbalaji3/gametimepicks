/**
 * `node --require` entry for the `next build` phase: installs the build-only ICU formatter cache in this process and,
 * through execArgv, in every static-generation worker. Why and how: ./intl-formatter-cache.cjs.
 */
"use strict";
require("./intl-formatter-cache.cjs").install();
