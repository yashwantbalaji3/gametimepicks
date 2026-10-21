// Per route family: bytes of HTML, __next_f, class attrs, and the bytes a "composite class" refactor could remove:
// for every class string ≥40 chars repeated ≥20× in a page, (len − 14) × count (14 ≈ ` class="xx-yyyy"` minimum).
// Also: inline sparkline <defs> gradients that a page-level shared <defs> would replace.
import fs from "node:fs";
const [O, LIST] = process.argv.slice(2);
const fam = (f) => { const p = f.replace(/\d{4}-\d{2}-\d{2}/g, "<d>").replace(/\/\d{5,}/g, "/<id>").split("/"); if (p[0] === "players" || p[0] === "matchups" || p[0] === "teams" || p[0] === "games") return p.slice(0, 2).join("/") + "/*"; if (p.length > 3) return p.slice(0, 3).join("/") + "/*"; return p.slice(0, -1).join("/") || "(root)"; };
const files = fs.readFileSync(LIST, "utf8").trim().split("\n").map((l) => l.split(" ")[1].slice(2)).filter((f) => f.endsWith(".html"));
const A = {};
for (const f of files) {
  const h = fs.readFileSync(`${O}/${f}`, "utf8"); const k = fam(f); const a = (A[k] ??= { n: 0, html: 0, nf: 0, cls: 0, save: 0, grad: 0, txt: 0 });
  a.n++; a.html += h.length;
  for (const m of h.matchAll(/<script>self\.__next_f\.push\([\s\S]*?<\/script>/g)) a.nf += m[0].length;
  const c = {}; for (const m of h.matchAll(/ class="([^"]*)"/g)) { a.cls += m[0].length; c[m[1]] = (c[m[1]] ?? 0) + 1; }
  for (const [s, n] of Object.entries(c)) if (s.length >= 40 && n >= 20) a.save += (s.length + 9 - 14) * n;
  for (const m of h.matchAll(/<defs><linearGradient id="vault-spark[\s\S]*?<\/defs>/g)) a.grad += m[0].length;
  const t = `${O}/${f.replace(/\.html$/, ".txt")}`; if (fs.existsSync(t)) a.txt += fs.statSync(t).size;
}
const tot = Object.values(A).reduce((s, a) => ({ html: s.html + a.html, txt: s.txt + a.txt, save: s.save + a.save, nf: s.nf + a.nf, grad: s.grad + a.grad }), { html: 0, txt: 0, save: 0, nf: 0, grad: 0 });
console.log("TOTAL html MB", (tot.html / 1e6).toFixed(1), "txt", (tot.txt / 1e6).toFixed(1), "__next_f", (tot.nf / 1e6).toFixed(1), "composite-class saving", (tot.save / 1e6).toFixed(1), "sparkline defs", (tot.grad / 1e6).toFixed(1));
console.log("family pages htmlMB txtMB nextF% class% compositeSaveMB sparkDefsMB");
for (const [k, a] of Object.entries(A).sort((x, y) => (y[1].html + y[1].txt) - (x[1].html + x[1].txt)).slice(0, 18)) console.log(k.padEnd(28), String(a.n).padStart(5), (a.html / 1e6).toFixed(1).padStart(7), (a.txt / 1e6).toFixed(1).padStart(6), (100 * a.nf / a.html).toFixed(0).padStart(4) + "%", (100 * a.cls / a.html).toFixed(0).padStart(4) + "%", (a.save / 1e6).toFixed(1).padStart(6), (a.grad / 1e6).toFixed(2).padStart(6));
