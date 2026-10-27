/**
 * NO-NETWORK GUARD — imported first (node --import) or at the top of a test file. Every outbound path Node offers
 * (fetch, http/https, net/tls connections, DNS) throws, so a test that passes under it proves the code under test
 * made no network call. Playwright still works: it talks to Chromium over stdio pipes, not sockets, and the
 * renderer aborts every request the page makes.
 */
import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import dns from "node:dns";

export const NETWORK_ATTEMPTS = [];
const block = (name) => function blocked(...args) {
  NETWORK_ATTEMPTS.push(name);
  throw new Error(`NETWORK BLOCKED in Phase 1: ${name}`);
};

globalThis.fetch = async (...args) => block("fetch")(...args);
net.connect = block("net.connect");
net.createConnection = block("net.createConnection");
const socketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function connect(...args) {
  const opts = args[0];
  // Local IPC paths (unix sockets/pipes) are not network; TCP host/port is.
  if (opts && typeof opts === "object" && typeof opts.path === "string") return socketConnect.apply(this, args);
  if (typeof opts === "string" && !/^\d+$/.test(opts)) return socketConnect.apply(this, args);
  return block("net.Socket.connect")(...args);
};
tls.connect = block("tls.connect");
http.request = block("http.request");
http.get = block("http.get");
https.request = block("https.request");
https.get = block("https.get");
dns.lookup = block("dns.lookup");
dns.resolve = block("dns.resolve");
