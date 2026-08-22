#!/usr/bin/env node
/**
 * Loopback static + /api/propose for guest-demo.
 * Bind 127.0.0.1 only. Key stays in env — never in the page.
 *
 *   node scripts/guest-demo-server.mjs
 *   open http://127.0.0.1:8765/
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfig, proposeWithModel } from "./lib/guest-propose.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");

function loadDotenv() {
  const file = path.join(root, ".env");
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const name = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[name] == null || process.env[name] === "") {
      process.env[name] = val;
    }
  }
}

loadDotenv();
const HOST = "127.0.0.1";
const PORT = Number(process.env.GUEST_DEMO_PORT || 8765);
const MAX_BODY = 1_000_000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml"
};

function send(res, status, body, type) {
  const buf = Buffer.from(body);
  res.writeHead(status, {
    "Content-Type": type || "text/plain; charset=utf-8",
    "Content-Length": buf.length,
    "Cache-Control": "no-store"
  });
  res.end(buf);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), "application/json; charset=utf-8");
}

function safeFile(urlPath) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel === "/guest-demo" || rel === "/guest-demo/") rel = "/";
  const cleaned = rel === "/" ? "/index.html" : rel;
  const abs = path.normalize(path.join(publicDir, cleaned));
  if (!abs.startsWith(publicDir)) return null;
  return abs;
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    let n = 0;
    req.on("data", function (c) {
      n += c.length;
      if (n > MAX_BODY) {
        reject(new Error("body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", function () {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

async function handlePropose(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method" });
    return;
  }
  if (!resolveConfig().keyed) {
    sendJson(res, 503, {
      ok: false,
      fallback: true,
      error: "no_api_key",
      hint: "Set GUEST_DEMO_API_KEY + GUEST_DEMO_API_BASE + GUEST_DEMO_MODEL (or NOUS_API_KEY / XAI_API_KEY). Stand-in proposer if unset."
    });
    return;
  }
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { ok: false, error: "bad_json" });
    return;
  }
  if (!payload || !payload.fixture) {
    sendJson(res, 400, { ok: false, error: "need_fixture" });
    return;
  }
  try {
    const out = await proposeWithModel(payload);
    sendJson(res, out.ok ? 200 : 502, out);
  } catch (err) {
    const code = err && err.code;
    if (code === "no_api_key") {
      sendJson(res, 503, { ok: false, fallback: true, error: "no_api_key" });
      return;
    }
    sendJson(res, 502, {
      ok: false,
      fallback: true,
      error: String((err && err.message) || err),
      status: err && err.status
    });
  }
}

const server = http.createServer(function (req, res) {
  const url = req.url || "/";
  if (url.startsWith("/api/status")) {
    const cfg = resolveConfig();
    sendJson(res, 200, {
      ok: true,
      keyed: cfg.keyed,
      model: cfg.model,
      base: cfg.base,
      source: cfg.source,
      bind: HOST + ":" + PORT
    });
    return;
  }
  if (url.startsWith("/api/propose")) {
    handlePropose(req, res).catch(function (err) {
      sendJson(res, 500, { ok: false, error: String(err && err.message) });
    });
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "method");
    return;
  }

  let file = safeFile(url);
  if (!file) {
    send(res, 403, "forbidden");
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, "index.html");
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    send(res, 404, "not found");
    return;
  }
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  const buf = fs.readFileSync(file);
  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": buf.length,
    "Cache-Control": "no-store"
  });
  if (req.method === "HEAD") res.end();
  else res.end(buf);
});

server.listen(PORT, HOST, function () {
  const cfg = resolveConfig();
  const keyed = cfg.keyed
    ? "keyed " + (cfg.preset || cfg.source) + " " + cfg.model
    : "no key · stand-in fallback";
  console.log("guest-demo http://" + HOST + ":" + PORT + "/  (" + keyed + ")");
});
