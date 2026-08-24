import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { validateMemoryRecord } from "../src/lib/memory-record.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

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

// 1. A real record, straight from stay.json's memory_persist shape.
const stay = JSON.parse(fs.readFileSync(path.join(root, "public/fixtures/stay.json"), "utf8"));
assert("real stay.json memory_persist passes", validateMemoryRecord(stay.memory_persist) !== null);

// 2. Unknown top-level key rejected, not stripped.
assert(
  "unknown top-level key rejected",
  validateMemoryRecord({ ...stay.memory_persist, model_chain_of_thought: "leak" }) === null
);

// 3. Wrong-typed field rejected.
assert(
  "wrong-typed stay_version rejected",
  validateMemoryRecord({ ...stay.memory_persist, stay_version: "1" }) === null
);

// 4. Escalation row with `stage` (what applyMemory() actually produces) passes.
const withEscalation = {
  ...stay.memory_persist,
  escalations: [{ id: "ESC-AC-01", type: "refund_decision", summary: "AC failure refund demand", stage: "in_stay" }]
};
assert("escalation row with stage passes", validateMemoryRecord(withEscalation) !== null);

// 5. Escalation row with an unknown key rejected.
const badEscalation = {
  ...stay.memory_persist,
  escalations: [{ id: "ESC-AC-01", type: "refund_decision", summary: "x", chain_of_thought: "leak" }]
};
assert("escalation row with unknown key rejected", validateMemoryRecord(badEscalation) === null);

// 6. Verify against real veto()/applyMemory() output end-to-end, using the
// same vm-loaded policy.js the offline test harness uses, to prove the
// allowlist matches production behavior, not just hand-written fixtures.
const context = { console };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "public/policy.js"), "utf8"), context, {
  filename: "public/policy.js"
});
const P = context.GUEST_POLICY;
const e2 = JSON.parse(fs.readFileSync(path.join(root, "public/fixtures/eval-2-escalate.json"), "utf8"));
const p2 = P.greedyPropose(e2);
const v2 = P.veto(e2, p2);
const hold = P.veto(e2, { option_id: "B", rationale: "escalate properly" });
const memAfterEscalate = P.applyMemory(stay, e2, hold);
assert(
  "real applyMemory() escalate output validates",
  validateMemoryRecord(memAfterEscalate) !== null
);

const e1 = JSON.parse(fs.readFileSync(path.join(root, "public/fixtures/eval-1-act.json"), "utf8"));
const p1 = P.greedyPropose(e1);
const v1 = P.veto(e1, p1);
const memAfterAct = P.applyMemory(stay, e1, v1);
assert("real applyMemory() act output validates", validateMemoryRecord(memAfterAct) !== null);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
