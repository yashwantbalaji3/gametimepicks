/**
 * The Neon OWNER connection string, for the Mac-only deploy scripts. It is typed or pasted at a hidden prompt, so it
 * never appears on screen, in shell history (it is not part of the command line), in a file or in Git. If the
 * variable DATABASE_URL_OWNER is already set, that is used instead (e.g. `DATABASE_URL_OWNER=$(…)` from a password
 * manager CLI, which also keeps the value out of history).
 */

/** Read one line from the keyboard without echoing it. Refuses when stdin is not a terminal (no piping it in by accident). */
export function hiddenPrompt(label, { input = process.stdin, output = process.stderr } = {}) {
  if (!input.isTTY) return Promise.reject(new Error("Run this in a Terminal window: the value is read from the keyboard, hidden."));
  output.write(label);
  input.setRawMode(true);
  input.resume();
  input.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = () => { input.off("data", onData); input.setRawMode(false); input.pause(); output.write("\n"); };
    function onData(chunk) {
      for (const ch of chunk.replace(/\x1b\[20[01]~/g, "")) { // bracketed-paste markers
        if (ch === "\r" || ch === "\n") { finish(); return resolve(value.trim()); }
        if (ch === "\u0003" || ch === "\u0004") { finish(); return reject(new Error("cancelled")); }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    }
    input.on("data", onData);
  });
}

/**
 * Checks the shape of an owner connection string WITHOUT ever including it in a message.
 * @returns {string|null} the problem, or null when it looks right
 */
export function ownerUrlProblem(value) {
  let u;
  try { u = new URL(value); } catch { return "that is not a connection string (expected postgresql://…)"; }
  if (!/^postgres(ql)?:$/.test(u.protocol)) return "it must start with postgresql://";
  if (!u.username || !u.password) return "it has no role name or password";
  if (/^gtp_cc_/.test(decodeURIComponent(u.username))) return "that is a Command Center runtime role, not the owner";
  if (!/\.neon\.tech$/.test(u.hostname)) return "the host is not a Neon host (…neon.tech)";
  if (u.hostname.includes("-pooler.")) return "that is the POOLED string: in Neon → Connect, turn \"Connection pooling\" off and copy the direct one";
  if (u.searchParams.get("sslmode") !== "require") return "it must include sslmode=require";
  return null;
}

/** The owner URL from DATABASE_URL_OWNER, else from the hidden prompt; validated. */
export async function ownerUrl(env = process.env) {
  const value = env.DATABASE_URL_OWNER || await hiddenPrompt("Neon owner connection string (paste; it stays hidden), then Return: ");
  const problem = ownerUrlProblem(value);
  if (problem) throw new Error(`Owner connection string refused: ${problem}. Nothing was changed.`);
  return value;
}

/** Any other Mac-side secret (Blob token, backup key): the variable if set, else the hidden prompt. Kept in this process only. */
export async function secretInput(name, label, env = process.env) {
  if (!env[name]) env[name] = await hiddenPrompt(`${label} (paste; it stays hidden), then Return: `);
  return env[name];
}
