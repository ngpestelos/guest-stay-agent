/**
 * Loads fixture/stay JSON from the Worker's own static assets, never from
 * the request body. public/app.js sends the entire fixture (including
 * agent_may/legal/moves_money) to the client-side veto today — trusting
 * that from a server-side caller would let an attacker forge a permissive
 * fixture. This module is the fix: the server reads its own known-good copy.
 */

const FIXTURE_FILE_RE = /^[a-z0-9-]+\.json$/;

export async function loadFixture(env, request, fixtureFile) {
  if (typeof fixtureFile !== "string" || !FIXTURE_FILE_RE.test(fixtureFile)) return null;
  const url = new URL("/fixtures/" + fixtureFile, request.url);
  const res = await env.ASSETS.fetch(new Request(url));
  if (!res.ok) return null;
  const json = await res.json();
  if (!Array.isArray(json.options) || !json.options.length) return null;
  return json;
}

export async function loadStay(env, request) {
  const url = new URL("/fixtures/stay.json", request.url);
  const res = await env.ASSETS.fetch(new Request(url));
  if (!res.ok) return null;
  return res.json();
}
