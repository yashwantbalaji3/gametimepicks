#!/usr/bin/env node
/**
 * X APP SETUP (founder, once, in your own Terminal) — saves the X app's OAuth 2.0 Client ID and, for a confidential
 * ("Web App, Automated App or Bot") app, its Client Secret to the macOS Keychain (service "gtp-command-center").
 *
 *   node command-center/scripts/x-setup.mjs            save / replace
 *   node command-center/scripts/x-setup.mjs --status   what is saved (never the values)
 *   node command-center/scripts/x-setup.mjs --forget   remove the client credentials and any X tokens
 *
 * Typing is hidden. Nothing is printed, logged, written to a file or sent anywhere. Then connect the account from the
 * Command Center (Queue → Connect X account).
 */
import readline from "node:readline";
import { createKeychainVault, SECRET } from "../publishers/token-vault.mjs";

const vault = createKeychainVault();
const arg = process.argv[2];

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    rl.question(question, (a) => { rl.close(); if (hidden) process.stdout.write("\n"); resolve(a.trim()); });
  });
}

if (arg === "--status") {
  const id = await vault.get(SECRET.clientId);
  const secret = await vault.get(SECRET.clientSecret);
  const tokens = await vault.get(SECRET.tokens);
  console.log(`Client ID: ${id ? `saved (…${id.slice(-4)})` : "not saved"}`);
  console.log(`Client Secret: ${secret ? "saved" : "none (public PKCE app, or not saved)"}`);
  console.log(`X account tokens: ${tokens ? "saved" : "not connected"}`);
} else if (arg === "--forget") {
  for (const k of Object.values(SECRET)) await vault.delete(k);
  console.log("Removed the X client credentials and tokens from the Keychain. Also revoke the app at https://x.com/settings/connected_apps if it was connected.");
} else {
  if (!process.stdin.isTTY) { console.error("Run this in your own Terminal (it asks with hidden input)."); process.exit(1); }
  console.log("X Developer Console → your app → Keys and tokens → OAuth 2.0 Client ID and Client Secret.");
  const id = await ask("OAuth 2.0 Client ID: ", { hidden: true });
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) { console.error("That doesn't look like an OAuth 2.0 Client ID (no change made)."); process.exit(1); }
  const secret = await ask("Client Secret (press Enter if your app type is Native App / public — none): ", { hidden: true });
  await vault.set(SECRET.clientId, id);
  if (secret) await vault.set(SECRET.clientSecret, secret);
  else await vault.delete(SECRET.clientSecret);
  console.log(`Saved to the Keychain (Client ID …${id.slice(-4)}${secret ? ", Client Secret" : ", no secret"}). Restart the Command Center, then Queue → Connect X account.`);
}
