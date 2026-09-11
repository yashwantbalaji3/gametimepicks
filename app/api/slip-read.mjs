/**
 * Read a betslip screenshot the signed-in user has already uploaded (P263).
 *
 * The browser puts the image in the private `slips` bucket under its own folder (the bucket's policies
 * allow nothing else), then posts the path here. This endpoint verifies the caller, fetches that one
 * object with the service role, asks Claude to read it, and returns the reading for the PERSON TO
 * CONFIRM. Nothing is written to the database here: a reading is a claim about a picture, and the row
 * is only created after its owner confirms (lib/accounts/slip-reading.mjs · toBetSlipRow).
 *
 * FAIL-CLOSED: with no ANTHROPIC_API_KEY / SUPABASE_SERVICE_ROLE_KEY / project URL it answers 503 and
 * reads nothing. Decisions live in _slip-read-core.mjs so every refusal is covered by a test; keys are
 * read from the environment and never logged, echoed, or returned.
 *
 * NOT YET EXERCISED AGAINST LIVE KEYS — the project does not exist until the founder creates it
 * (docs/ACCOUNTS_SETUP.md). The core's decisions are tested; this network path is not, and the first
 * real upload is its first run.
 */
import { decideSlipRead, auditLine } from "./_slip-read-core.mjs";
import { READING_PROMPT, validateReading } from "../src/lib/accounts/slip-reading.mjs";

const MODEL = "claude-sonnet-5";
const ANTHROPIC = "https://api.anthropic.com/v1/messages";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, reason: "POST only" });

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body ?? {};
  const decision = decideSlipRead({ env: process.env, authorization: req.headers?.authorization, body });
  console.log(auditLine(decision, body));
  if (!decision.proceed) return res.status(decision.status).json({ ok: false, reason: decision.reason });

  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/$/, "");
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    /*
     * The caller's own token decides WHO they are — never the body. A body can claim any user id; a
     * token cannot, and the id that comes back from Supabase is the only one the path is checked
     * against. (The core already refused a path outside body.userId; this is the check that makes that
     * id trustworthy.)
     */
    const token = String(req.headers.authorization).slice(7).trim();
    const who = await fetch(`${base}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: service } });
    if (!who.ok) return res.status(401).json({ ok: false, reason: "sign in to read a slip" });
    const user = await who.json();
    if (!user?.id || user.id !== body.userId) return res.status(403).json({ ok: false, reason: "a slip can only be read from your own folder" });

    const object = await fetch(`${base}/storage/v1/object/slips/${encodeURI(body.path)}`, {
      headers: { Authorization: `Bearer ${service}`, apikey: service },
    });
    if (!object.ok) return res.status(404).json({ ok: false, reason: "that upload was not found" });
    const image = Buffer.from(await object.arrayBuffer()).toString("base64");

    const answer = await fetch(ANTHROPIC, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: body.contentType, data: image } },
            { type: "text", text: READING_PROMPT },
          ],
        }],
      }),
    });
    if (!answer.ok) {
      console.log(JSON.stringify({ slipRead: "model-error", status: answer.status }));
      return res.status(502).json({ ok: false, reason: "the reader could not be reached — try again, or enter the slip by hand" });
    }
    const payload = await answer.json();
    const text = (payload?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
    const checked = validateReading(safeParse(text.replace(/^```(?:json)?|```$/g, "").trim()));

    /* The reading, its doubts, and the fact that it is not saved. The client shows all three. */
    return res.status(200).json({
      ok: checked.ok,
      reading: checked.normalised,
      errors: checked.errors,
      review: checked.review,
      saved: false,
      note: "Check this against your slip before saving it — nothing has been recorded yet.",
    });
  } catch (e) {
    console.log(JSON.stringify({ slipRead: "failed", message: String(e?.message ?? e).slice(0, 160) }));
    return res.status(500).json({ ok: false, reason: "the slip could not be read — enter it by hand and nothing is lost" });
  }
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}
