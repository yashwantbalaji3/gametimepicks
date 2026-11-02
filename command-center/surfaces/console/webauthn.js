/* GTP CEO console — passkey helper for hosted mode. Loaded everywhere; does nothing until the server says it is hosted. */
(() => {
  "use strict";
  const b64uToBuf = (s) => {
    let b = s.replace(/-/g, "+").replace(/_/g, "/");
    while (b.length % 4) b += "=";
    return Uint8Array.from(atob(b), (c) => c.charCodeAt(0)).buffer;
  };
  const bufToB64u = (buf) => {
    let bin = "";
    for (const x of new Uint8Array(buf)) bin += String.fromCharCode(x);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const creation = (o) => ({ ...o, challenge: b64uToBuf(o.challenge), user: { ...o.user, id: b64uToBuf(o.user.id) }, excludeCredentials: (o.excludeCredentials ?? []).map((c) => ({ ...c, id: b64uToBuf(c.id) })) });
  const request = (o) => ({ ...o, challenge: b64uToBuf(o.challenge), allowCredentials: (o.allowCredentials ?? []).map((c) => ({ ...c, id: b64uToBuf(c.id) })) });
  const regJSON = (c) => ({
    id: c.id, rawId: bufToB64u(c.rawId), type: c.type, clientExtensionResults: c.getClientExtensionResults(), authenticatorAttachment: c.authenticatorAttachment ?? undefined,
    response: { clientDataJSON: bufToB64u(c.response.clientDataJSON), attestationObject: bufToB64u(c.response.attestationObject), transports: c.response.getTransports?.() ?? [] },
  });
  const authJSON = (c) => ({
    id: c.id, rawId: bufToB64u(c.rawId), type: c.type, clientExtensionResults: c.getClientExtensionResults(), authenticatorAttachment: c.authenticatorAttachment ?? undefined,
    response: {
      clientDataJSON: bufToB64u(c.response.clientDataJSON), authenticatorData: bufToB64u(c.response.authenticatorData),
      signature: bufToB64u(c.response.signature), userHandle: c.response.userHandle ? bufToB64u(c.response.userHandle) : undefined,
    },
  });

  async function api(url, body) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-CC-Console": "1" }, body: JSON.stringify(body ?? {}), credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ...data };
  }
  const fail = (code) => { const e = new Error(code); e.code = code; throw e; };

  async function assertion(optionsUrl, body) {
    const o = await api(optionsUrl, body);
    if (!o.ok) fail(o.code ?? "OPTIONS_REFUSED");
    const cred = await navigator.credentials.get({ publicKey: request(o.options) });
    if (!cred) fail("CANCELLED");
    return { challengeId: o.challengeId, response: authJSON(cred) };
  }

  /** Step-up actions: must mirror stepUpActionFor() in hosted/app.mjs. */
  function stepUpActionFor(url, body) {
    if (url === "/api/decide") return body.verdict === "approve" ? "approve" : body.verdict === "keep" ? "keep" : null;
    if (url === "/api/pause") return body.paused === false ? "resume" : null;
    if (url === "/api/command") return null;
    if (url === "/api/attest") return "attest";
    if (url === "/api/seat") return "seat";
    if (url === "/api/post") return body.action === "publish" ? "attest" : null;
    if (url === "/api/design") return "approve";
    if (url === "/api/publishing") {
      if (body.action === "hold") return body.held === true ? null : "hold-release";
      if (body.action === "replace-held") return "replace-held";
      if (["live-test", "schedule", "reconcile"].includes(body.action)) return "publish-live";
      if (body.action === "policy") return body.mode === "dry-run" ? null : "publishing-policy";
      if (body.action === "x-connect") return "connect-x";
      if (body.action === "publisher-host") return "publishing-policy";
      if (body.action === "queue-prep") return "publishing-policy";
      if (body.action === "resume") return "resume";
      return null;
    }
    if (url === "/api/users/invite" || url === "/api/users/update") return "manage-users";
    return null;
  }

  window.GTPAuth = {
    hosted: false,
    async status() {
      const res = await fetch("/api/auth/status", { cache: "no-store", credentials: "same-origin" });
      if (res.status === 404) return { hosted: false };
      const s = await res.json();
      this.hosted = Boolean(s.hosted);
      return s;
    },
    async inviteInfo(inviteToken) {
      return api("/api/auth/invite/info", { inviteToken });
    },
    async register({ setupToken, inviteToken, label }) {
      const o = await api("/api/auth/register/options", { setupToken, inviteToken });
      if (!o.ok) fail(o.code ?? "REGISTER_REFUSED");
      const cred = await navigator.credentials.create({ publicKey: creation(o.options) });
      if (!cred) fail("CANCELLED");
      const r = await api("/api/auth/register/verify", { challengeId: o.challengeId, response: regJSON(cred), label, setupToken, inviteToken });
      if (!r.ok) fail(r.code ?? "REGISTER_REFUSED");
      return r;
    },
    /** A backup passkey from a signed-in session: the existing passkey confirms first (step-up). */
    async addPasskey(label) {
      const o = await api("/api/auth/register/options", {});
      if (!o.ok) fail(o.code ?? "REGISTER_REFUSED");
      const stepUp = await assertion("/api/auth/stepup/options", { action: "register-passkey", payload: { label } });
      const cred = await navigator.credentials.create({ publicKey: creation(o.options) });
      if (!cred) fail("CANCELLED");
      const r = await api("/api/auth/register/verify", { challengeId: o.challengeId, response: regJSON(cred), label, stepUp });
      if (!r.ok) fail(r.code ?? "REGISTER_REFUSED");
      return r;
    },
    async login() {
      const a = await assertion("/api/auth/login/options", {});
      const r = await api("/api/auth/login/verify", a);
      if (!r.ok) fail(r.code ?? "LOGIN_FAILED");
      return r;
    },
    async recover(code) {
      const r = await api("/api/auth/recover", { code });
      if (!r.ok) fail(r.code ?? "RECOVERY_FAILED");
      return r;
    },
    async logout() {
      return api("/api/auth/logout", {});
    },
    async logoutAll() {
      return api("/api/auth/logout-all", {});
    },
    /** Replace the founder's recovery codes: Face ID / Touch ID confirms, then the new set comes back once. */
    async newRecoveryCodes() {
      const stepUp = await assertion("/api/auth/stepup/options", { action: "recovery-codes", payload: {} });
      const r = await api("/api/auth/recovery-codes", { stepUp });
      if (!r.ok) fail(r.code ?? "RECOVERY_CODES_REFUSED");
      return r.recoveryCodes;
    },
    stepUpActionFor,
    /** For a hosted action that needs it, a passkey assertion bound to exactly this request body. */
    async withStepUp(url, body) {
      const action = this.hosted ? stepUpActionFor(url, body) : null;
      if (!action) return body;
      const stepUp = await assertion("/api/auth/stepup/options", { action, payload: body });
      return { ...body, stepUp };
    },
  };
})();
