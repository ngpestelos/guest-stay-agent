/**
 * Static assets + HTTPS redirect + /api/status + /api/propose.
 * API keys come from Worker secrets / vars — never from the page.
 */
import { resolveConfig, proposeWithModel } from "../scripts/lib/guest-propose.mjs";

function json(obj, status) {
  return Response.json(obj, {
    status: status || 200,
    headers: { "Cache-Control": "no-store" }
  });
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

    return env.ASSETS.fetch(request);
  }
};
