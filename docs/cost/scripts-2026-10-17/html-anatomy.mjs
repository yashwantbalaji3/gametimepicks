import fs from "node:fs";
const [O, ...pages] = process.argv.slice(2);
for (const p of pages) {
  const h = fs.readFileSync(`${O}/${p}`, "utf8"); const T = Buffer.byteLength(h);
  const sum = (re) => { let s = 0, n = 0; for (const m of h.matchAll(re)) { s += Buffer.byteLength(m[0]); n++; } return [s, n]; };
  const [nf, nfn] = sum(/<script>self\.__next_f\.push\([\s\S]*?<\/script>/g);
  const [scr] = sum(/<script\b[\s\S]*?<\/script>/g);
  const [cls, clsn] = sum(/ class="[^"]*"/g);
  const [sty] = sum(/ style="[^"]*"/g);
  const [svg] = sum(/<svg\b[\s\S]*?<\/svg>/g);
  const [dat] = sum(/ data-[a-z-]+="[^"]*"/g);
  const [aria] = sum(/ aria-[a-z-]+="[^"]*"/g);
  const [title] = sum(/ title="[^"]*"/g);
  const [hid] = sum(/<[^>]+ hidden(?:=""|)[ >][\s\S]{0,0}/g);
  const body = h.replace(/<script\b[\s\S]*?<\/script>/g, "");
  const text = body.replace(/<[^>]+>/g, "");
  const txtPath = `${O}/${p.replace(/\.html$/, ".txt")}`; const txt = fs.existsSync(txtPath) ? fs.statSync(txtPath).size : 0;
  const tags = {}; for (const m of body.matchAll(/<([a-z0-9]+)\b/g)) tags[m[1]] = (tags[m[1]] ?? 0) + 1;
  const ctop = {}; for (const m of h.matchAll(/ class="([^"]*)"/g)) ctop[m[1]] = (ctop[m[1]] ?? 0) + m[0].length;
  const pct = (x) => (100 * x / T).toFixed(1) + "%";
  console.log(`\n## ${p}  ${(T / 1e3).toFixed(0)} KB  (.txt ${(txt / 1e3).toFixed(0)} KB)`);
  console.log(`__next_f ${pct(nf)} (${nfn} chunks) | other script ${pct(scr - nf)} | markup ${pct(T - scr)} of which class= ${pct(cls)} (${clsn}) style= ${pct(sty)} svg ${pct(svg)} data-* ${pct(dat)} aria ${pct(aria)} title ${pct(title)} | visible text ${pct(Buffer.byteLength(text))} | elements ${Object.values(tags).reduce((a, b) => a + b, 0)} top ${Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k + ":" + v).join(" ")}`);
  console.log("top classes by bytes:", Object.entries(ctop).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${(v / 1e3).toFixed(0)}KB "${k.slice(0, 70)}"`).join(" | "));
}
