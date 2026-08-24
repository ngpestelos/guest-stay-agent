/**
 * Prototype: does the gate discriminate between two legal, in-policy options,
 * or does it treat them identically and leave the choice to the model?
 *
 * eval-judgment-late-arrival.json has two options (A: self-check-in,
 * B: assisted check-in) that are both agent_may && legal && non-money &&
 * non-access. Neither is withdrawn. This is NOT an act/escalate/stop test —
 * both are "act". It tests whether tier-2 discretion (option choice, reply
 * wording) is architecturally real, i.e. the veto never silently prefers
 * one legal option over another.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const context = { console };
context.globalThis = context;
vm.createContext(context);

function load(rel) {
  vm.runInContext(fs.readFileSync(path.join(root, rel), "utf8"), context, {
    filename: rel
  });
}
load("public/policy.js");

const P = context.GUEST_POLICY;
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(root, "public/fixtures/eval-judgment-late-arrival.json"),
    "utf8"
  )
);

let pass = 0;
let fail = 0;
function assert(name, cond) {
  if (cond) {
    pass += 1;
    console.log("PASS " + name);
  } else {
    fail += 1;
    console.log("FAIL " + name);
  }
}

// 1. The gate must not silently prefer A over B, or vice versa.
const vA = P.veto(fixture, {
  option_id: "A",
  guest_reply: "Self check-in — I'll send the lockbox code closer to arrival."
});
const vB = P.veto(fixture, {
  option_id: "B",
  guest_reply:
    "I'll have the host on-call meet you both at the door around 22:30."
});

assert("option A is legal act", vA.call === "act" && vA.ticket === true && vA.side_effect === true);
assert("option B is legal act", vB.call === "act" && vB.ticket === true && vB.side_effect === true);
assert(
  "gate does not discriminate between two legal options",
  vA.call === vB.call && vA.ticket === vB.ticket && vA.side_effect === vB.side_effect
);
assert(
  "model wording for A flows through untouched",
  vA.guest_reply.indexOf("lockbox code") >= 0
);
assert(
  "model wording for B flows through untouched",
  vB.guest_reply.indexOf("22:30") >= 0
);

// 2. The rule-based fallback (greedyPropose) is judgment-blind: it never
// reads guest_message, so it always resolves to the same option regardless
// of what the guest actually asked for. This is the gap a real model closes.
const greedy = P.greedyPropose(fixture);
assert(
  "greedy fallback is deterministic (judgment-blind)",
  greedy.option_id === "A"
);
assert(
  "expected (judgment-aware) answer differs from the judgment-blind default",
  fixture.expected.option_id === "B" && greedy.option_id !== fixture.expected.option_id
);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
