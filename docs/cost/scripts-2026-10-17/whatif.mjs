import fs from "node:fs";
const S = process.argv[2]; const R = JSON.parse(fs.readFileSync(`${S}/push-refined.json`, "utf8"));
const C = R.filter((r) => r.outcome === "completed" && r.rcls === "MEANINGFUL");
const DERIVED = /(\.|^)(ageHours|ageMinutes|ageDays|hoursAway|priceAgeDays|latestEventLagDays|etTime)$/;
const scen = {
  "X1 admin/status.json non-input (#1088)": { files: [/admin\/status\.json$/], paths: null },
  "X2 = X1 + clock-derived ages (ageHours/hoursAway/priceAgeDays/etTime/lagDays)": { files: [/admin\/status\.json$/], paths: DERIVED },
  "X3 = X2 + all admin/*.json non-input": { files: [/app\/public\/data\/admin\//], paths: DERIVED },
  "X4 = X3 + projection receipt/readiness non-input": { files: [/app\/public\/data\/admin\//, /data\/[a-z]+-projection\/v1\/(receipt|readiness)\.json$/], paths: DERIVED },
};
for (const [name, s] of Object.entries(scen)) {
  const ok = []; const blocked = {};
  for (const r of C) {
    let pass = true;
    for (const [f, ps] of Object.entries(r.nonClock ?? {})) {
      if (s.files.some((re) => re.test(f))) continue;
      if (s.paths && ps.length < 12 && ps.every((p) => DERIVED.test(p))) continue;
      pass = false; blocked[f] = (blocked[f] ?? 0) + 1;
    }
    if (pass) ok.push(r);
  }
  const by = {}; for (const r of ok) { const k = r.buckets.slice().sort().join("+") + (r.prevOutcome === "completed" ? "" : "[prev " + r.prevOutcome + "]"); by[k] = (by[k] ?? 0) + 1; }
  console.log("\n" + name + ": +" + ok.length + " completed pushes become avoidable", JSON.stringify(by));
}
