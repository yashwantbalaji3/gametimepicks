#!/usr/bin/env node
/**
 * Make the one-time setup token for registering the first passkey. Prints the token (type it on the iPhone once)
 * and its sha256 (the only thing stored, as GTP_CC_SETUP_TOKEN_SHA256 in Vercel). Nothing is written to disk.
 * After the first passkey exists the token is useless; remove the variable then.
 */
import crypto from "node:crypto";

const token = crypto.randomBytes(18).toString("base64url");
console.log(`setup token (type once on the iPhone, then forget it): ${token}`);
console.log(`GTP_CC_SETUP_TOKEN_SHA256=${crypto.createHash("sha256").update(token).digest("hex")}`);
