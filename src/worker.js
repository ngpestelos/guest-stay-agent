/**
 * Static assets + HTTPS redirect + /api/status + /api/propose + /api/act.
 *
 * /api/propose stays fully client-facing with no gate — it never had a side
 * effect to protect. /api/act is the only code path that can persist memory:
 * fixture/stay load server-side (never trusted from the client), veto() runs
 * server-side, and persistence follows whatever applyMemory()'s spec for
 * that verdict says.
 *
 * Two credentials satisfy X-Act-Key: ACT_DEMO_KEY (a real Worker secret,
 * durable, given only to the operator for terminal/curl use) and UI_ACT_KEY
 * (a plain wrangler.jsonc var, intentionally public — it ships inside
 * public/app.js so the Play UI can call /api/act too). UI_ACT_KEY is
 * time-boxed via UI_ACT_KEY_EXPIRES_AT; past that timestamp it's rejected
 * and app.js falls back to its original client-side-only behavior.
 */
import { resolveConfig, proposeWithModel } from "../scripts/lib/guest-propose.mjs";
import { loadFixture, loadStay } from "./lib/trusted-fixtures.mjs";
import { validateMemoryRecord } from "./lib/memory-record.mjs";
import policyModule from "../public/policy.js";

const { GUEST_POLICY } = policyModule;

function json(obj, status) {
  return Response.json(obj, {
    status: status || 200,
    headers: { "Cache-Control": "no-store" }
  });
}

function requireActKey(request, env) {
  const provided = request.headers.get("X-Act-Key") || "";
  if (!provided) return false;
  if (env.ACT_DEMO_KEY && provided === env.ACT_DEMO_KEY) return true;
  if (env.UI_ACT_KEY && provided === env.UI_ACT_KEY) {
    const expires = env.UI_ACT_KEY_EXPIRES_AT ? Date.parse(env.UI_ACT_KEY_EXPIRES_AT) : NaN;
    return Number.isFinite(expires) && Date.now() < expires;
  }
  return false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.protocol === "http:") {
      url.protocol = "https:";
      return Response.redirect(url.href, 301);
    }

    if (url.pathname === "/api/status" || url.pathname.startsWith("/api/status")) {
      const cfg = resolveConfig(env);
      return json({
        ok: true,
        keyed: cfg.keyed,
        model: cfg.model,
        base: cfg.base,
        source: cfg.source
      });
    }

    if (url.pathname === "/api/propose" || url.pathname.startsWith("/api/propose")) {
      if (request.method !== "POST") return json({ ok: false, error: "method" }, 405);
      const cfg = resolveConfig(env);
      if (!cfg.keyed) {
        return json(
          {
            ok: false,
            fallback: true,
            error: "no_api_key",
            hint: "Set a Worker secret: NOUS_API_KEY or GUEST_DEMO_API_KEY."
          },
          503
        );
      }
      let payload;
      try {
        payload = await request.json();
      } catch {
        return json({ ok: false, error: "bad_json" }, 400);
      }
      if (!payload || !payload.fixture) {
        return json({ ok: false, error: "need_fixture" }, 400);
      }
      try {
        const out = await proposeWithModel(payload, { env: env });
        return json(out, out.ok ? 200 : 502);
      } catch (err) {
        const code = err && err.code;
        if (code === "no_api_key" || code === "no_api_base" || code === "no_model") {
          return json({ ok: false, fallback: true, error: code }, 503);
        }
        return json(
          {
            ok: false,
            fallback: true,
            error: String((err && err.message) || err),
            status: err && err.status
          },
          502
        );
      }
    }

    if (url.pathname === "/api/act/memory") {
      if (!requireActKey(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
      const bookingId = url.searchParams.get("booking_id");
      if (!bookingId) return json({ ok: false, error: "need_booking_id" }, 400);
      if (request.method === "GET") {
        const memory = env.STAY_MEMORY ? await env.STAY_MEMORY.get(bookingId, "json") : null;
        return json({ ok: true, memory: memory || null });
      }
      if (request.method === "DELETE") {
        if (env.STAY_MEMORY) await env.STAY_MEMORY.delete(bookingId);
        return json({ ok: true, memory: null });
      }
      return json({ ok: false, error: "method" }, 405);
    }

    if (url.pathname === "/api/act") {
      if (request.method !== "POST") return json({ ok: false, error: "method" }, 405);
      if (!requireActKey(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
      const cfg = resolveConfig(env);
      if (!cfg.keyed) {
        return json({ ok: false, fallback: true, error: "no_api_key" }, 503);
      }
      let payload;
      try {
        payload = await request.json();
      } catch {
        return json({ ok: false, error: "bad_json" }, 400);
      }
      if (!payload || typeof payload.fixture_file !== "string") {
        return json({ ok: false, error: "need_fixture_file" }, 400);
      }

      const fixture = await loadFixture(env, request, payload.fixture_file);
      if (!fixture) return json({ ok: false, error: "bad_fixture" }, 400);
      const stay = await loadStay(env, request);
      if (!stay) return json({ ok: false, error: "stay_unavailable" }, 500);

      const bookingId = stay.stay.booking_id;
      const currentMemory =
        (env.STAY_MEMORY ? await env.STAY_MEMORY.get(bookingId, "json") : null) || stay.memory_persist;

      let out;
      try {
        out = await proposeWithModel(
          {
            fixture,
            stay,
            memory: currentMemory,
            guest_message: payload.guest_message,
            story: payload.story
          },
          { env }
        );
      } catch (err) {
        const code = err && err.code;
        if (code === "no_api_key" || code === "no_api_base" || code === "no_model") {
          return json({ ok: false, fallback: true, error: code }, 503);
        }
        return json(
          { ok: false, fallback: true, error: String((err && err.message) || err), status: err && err.status },
          502
        );
      }
      if (!out.ok) return json(out, 502);

      const verdict = GUEST_POLICY.veto(fixture, out.proposal);

      // applyMemory() is safe to call for any verdict.call (act/escalate/stop) —
      // it looks up fixture.memory[verdict.call] and no-ops if that key is absent.
      // escalate and stop both carry legitimate audit-worthy specs (e.g. eval-2's
      // "escalate" spec records the ESC-AC-01 escalation for host review; eval-3's
      // "stop" spec records the refused offer) — restricting the write to "act"
      // only would silently drop the audit trail this session's own answer to Q1
      // promised ("host override needs to be recorded so it can be reviewed").
      let nextMemory = currentMemory;
      const stayView = { ...stay, memory_persist: currentMemory };
      const candidate = GUEST_POLICY.applyMemory(stayView, fixture, verdict);
      const validated = validateMemoryRecord(candidate);
      if (validated && env.STAY_MEMORY) {
        await env.STAY_MEMORY.put(bookingId, JSON.stringify(validated));
        nextMemory = validated;
      }

      return json({
        ok: true,
        model: out.model,
        proposal: out.proposal,
        trace: out.trace,
        verdict,
        memory: nextMemory
      });
    }

    return env.ASSETS.fetch(request);
  }
};
