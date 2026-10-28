/** H0 review fix: on the hosted runner, Claude-written code runs as a separate no-sudo user with an empty environment. */
import test from "node:test";
import assert from "node:assert/strict";
import { sandboxedCommand } from "../engineering/verify.mjs";

test("locally the command is unchanged; hosted, it runs as the sandbox user with env -i, a timeout and (for tests) no network", () => {
  assert.deepEqual(sandboxedCommand("node", ["a.mjs"], { PATH: "/bin" }), { cmd: "node", args: ["a.mjs"], env: { PATH: "/bin" } });
  const sb = { user: "ccsandbox", home: "/tmp/ccsandbox" };
  const tests = sandboxedCommand("node", ["--test"], { PATH: "/bin" }, { sandbox: sb, network: false, timeoutSec: 60 });
  assert.equal(tests.cmd, "sudo");
  assert.deepEqual(tests.args.slice(0, 4), ["-n", "unshare", "--net", "--"]);
  assert.match(tests.args.join(" "), /ip link set lo up && exec "\$@" sh sudo -n -u ccsandbox/, "loopback up, then drop to the sandbox user");
  const i = tests.args.indexOf("env");
  assert.equal(tests.args[i + 1], "-i");
  assert.deepEqual(tests.args.slice(tests.args.indexOf("-u"), tests.args.indexOf("-u") + 2), ["-u", "ccsandbox"]);
  assert.ok(tests.args.includes("HOME=/tmp/ccsandbox"));
  assert.ok(!tests.args.some((a) => /DATABASE_URL|CLAUDE_CODE_OAUTH_TOKEN/.test(a)));
  assert.deepEqual(Object.keys(tests.env), ["PATH"], "sudo itself gets only PATH");
  const server = sandboxedCommand("node", ["server.mjs"], { PATH: "/bin" }, { sandbox: sb });
  assert.equal(server.args[0], "-n");
  assert.equal(server.args.includes("unshare"), false, "the console keeps loopback so the browser can reach it");
});
