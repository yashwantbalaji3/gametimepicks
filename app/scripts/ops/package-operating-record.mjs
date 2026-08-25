#!/usr/bin/env node
/**
 * PACKAGE THE OPERATING RECORD FOR PUBLICATION (Program 205 · Release A/B).
 *
 *   npx tsx scripts/ops/package-operating-record.mjs
 *
 * The P0 chain, finally at the right boundary: the founder's truncated PDFs were their BROWSER'S
 * print of the artifact VIEW — a path no local verifier can control. So the published page now
 * carries the verified PDF's exact bytes, embedded, behind a viewer-confirmed download button
 * (the `downloads` runtime capability), and says plainly that printing the view is not the file
 * of record. What the founder downloads is byte-identical to what the verifier proved.
 *
 * Inputs (must already exist and agree):
 *   data/internal/launch/operating-record.html          — the verified core document
 *   data/internal/launch/operating-record.pdf           — the verified bytes
 *   data/internal/launch/operating-record-pdf-receipt.json — the manifest (sha256, rows, ids)
 * Outputs:
 *   data/internal/launch/operating-record-published.html — core + version panel + download button
 *   app/public/data/admin/operating-record-<sha16>.pdf   — content-addressed console copy
 *     (served ONLY by the internal deployment; the public build's data sweep removes it)
 *
 * Refuses when the receipt's checksum does not match the PDF bytes on disk — packaging a file the
 * verifier did not prove is exactly the false-positive class this program exists to end.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LAUNCH_DIR = path.resolve(APP, "..", "data", "internal", "launch");
const html = fs.readFileSync(path.join(LAUNCH_DIR, "operating-record.html"), "utf8");
const pdf = fs.readFileSync(path.join(LAUNCH_DIR, "operating-record.pdf"));
const receipt = JSON.parse(fs.readFileSync(path.join(LAUNCH_DIR, "operating-record-pdf-receipt.json"), "utf8"));

const pdfSha = crypto.createHash("sha256").update(pdf).digest("hex");
if (pdfSha !== receipt.pdfSha256) {
  console.error(`REFUSED: pdf bytes (${pdfSha.slice(0, 16)}) do not match the verifier's receipt (${String(receipt.pdfSha256).slice(0, 16)}) — run the verifier first`);
  process.exit(1);
}
const htmlSha = crypto.createHash("sha256").update(html).digest("hex");
if (htmlSha !== receipt.htmlSha256) {
  console.error("REFUSED: core HTML changed after verification — regenerate and re-verify");
  process.exit(1);
}

const sha16 = pdfSha.slice(0, 16);
const b64 = pdf.toString("base64");

const panel = `
<section style="margin-top:44px;border:1px solid var(--accent);border-radius:10px;padding:16px 18px;background:var(--accent-q)">
  <h2 style="font-size:18px">The file of record</h2>
  <p style="margin-top:8px;font-size:13.5px;max-width:74ch">
    Printing or exporting THIS VIEW goes through your browser and the viewer&rsquo;s own layout — it may
    paginate or clip, and it is not the verified document. The button below hands you the exact bytes the
    final-file verifier proved: every register row, in order, terminal marker on the last page.
  </p>
  <p class="stamp" style="margin-top:10px">
    <span>${receipt.releases} rows</span><span>${receipt.first} → ${receipt.last}</span>
    <span>${receipt.pages} pages</span><span>pdf sha256 ${sha16}…</span>
    <span>verified ${receipt.verifiedAt}</span><span>${receipt.rendererVersion}</span>
  </p>
  <button id="dl-record" hidden style="margin-top:12px;min-height:44px;padding:0 18px;border-radius:999px;border:1px solid var(--accent);background:var(--surface);color:var(--accent);font:700 12px 'IBM Plex Mono',monospace;letter-spacing:.08em;text-transform:uppercase;cursor:pointer">
    Download the verified PDF (${sha16}…)
  </button>
  <p id="dl-note" style="margin-top:8px;font-size:12px;color:var(--faint)">Preparing the download control…</p>
</section>
<script>
(function () {
  var B64 = "${b64}";
  var SHA16 = "${sha16}";
  var btn = document.getElementById("dl-record");
  var note = document.getElementById("dl-note");
  function bytes() {
    var bin = atob(B64), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }
  if (!window.claude || typeof window.claude.use !== "function") {
    note.textContent = "Downloads are unavailable in this view. The same verified file (sha256 " + SHA16 + "\\u2026) is served on the protected console at /data/admin/operating-record-" + SHA16 + ".pdf.";
    return;
  }
  window.claude.use("downloads").then(function (downloads) {
    if (!downloads) {
      note.textContent = "Downloads are unavailable in this view. The same verified file (sha256 " + SHA16 + "\\u2026) is served on the protected console at /data/admin/operating-record-" + SHA16 + ".pdf.";
      return;
    }
    btn.hidden = false;
    note.textContent = "The saved file is byte-identical to the verified checksum above.";
    btn.addEventListener("click", function () {
      btn.disabled = true;
      downloads.save({ filename: "operating-record-" + SHA16 + ".pdf", data: bytes() }).then(function () {
        note.textContent = "Saved. Verify: shasum -a 256 on the file should start " + SHA16 + ".";
        btn.disabled = false;
      }).catch(function (err) {
        btn.disabled = false;
        var code = err && err.code ? err.code : "unavailable";
        if (code === "declined") note.textContent = "Save declined — the button stays here when you want it.";
        else if (code === "rate_limited") note.textContent = "A save prompt is already open — finish it, then try again.";
        else if (code === "extension_not_enabled" || code === "rejected_extension") note.textContent = "PDF saves are not enabled in this view. The same verified file is served on the protected console at /data/admin/operating-record-" + SHA16 + ".pdf.";
        else note.textContent = "Saving is unavailable in this view (" + code + "). The verified file is served on the protected console at /data/admin/operating-record-" + SHA16 + ".pdf.";
      });
    });
  });
})();
</script>`;

/* Panel goes directly before the terminal end marker so the core document (what the PDF renders
   from) is untouched above it — one document, two boundaries, both stated. */
const marker = "<!-- OPERATING-RECORD-END";
const published = html.replace(marker, panel + "\n" + marker);

fs.writeFileSync(path.join(LAUNCH_DIR, "operating-record-published.html"), published);

/* Content-addressed console copy — internal deployment only (public data sweep removes it). */
const adminDir = path.join(APP, "public", "data", "admin");
fs.mkdirSync(adminDir, { recursive: true });
for (const f of fs.readdirSync(adminDir).filter((x) => /^operating-record-[0-9a-f]{16}\.pdf$/.test(x))) {
  if (f !== `operating-record-${sha16}.pdf`) fs.unlinkSync(path.join(adminDir, f));   // one current pointer
}
fs.writeFileSync(path.join(adminDir, `operating-record-${sha16}.pdf`), pdf);
fs.writeFileSync(path.join(adminDir, "operating-record-manifest.json"), JSON.stringify({ ...receipt, contentAddressed: `operating-record-${sha16}.pdf` }, null, 1) + "\n");

console.log(`packaged: published.html (+download panel, ${Math.round(b64.length / 1024)}KB embed) · admin/operating-record-${sha16}.pdf · manifest`);
