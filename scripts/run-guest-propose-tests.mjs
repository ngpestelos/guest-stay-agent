import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseProposalJson,
  runTool,
  proposeWithModel,
  resolveConfig
} from "./lib/guest-propose.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const demo = path.join(root, "public");
const stay = JSON.parse(
  fs.readFileSync(path.join(demo, "fixtures", "stay.json"), "utf8")
);
const e2 = JSON.parse(
  fs.readFileSync(path.join(demo, "fixtures", "eval-2-escalate.json"), "utf8")
);
const e3 = JSON.parse(
  fs.readFileSync(path.join(demo, "fixtures", "eval-3-stop.json"), "utf8")
);

let pass = 0;
let fail = 0;
const lines = [];

function assert(name, cond) {
  if (cond) {
    pass += 1;
    lines.push("PASS " + name);
  } else {
    fail += 1;
    lines.push("FAIL " + name);
  }
}

assert(
  "parse fenced JSON",
  parseProposalJson('```json\n{"option_id":"B","call":"escalate","rationale":"hold"}\n```')
    .option_id === "B"
);

const empty = resolveConfig({});
assert("no key is unkeyed", empty.keyed === false && empty.key === "");

const nous = resolveConfig({ NOUS_API_KEY: "nous-test" });
assert("NOUS_API_KEY infers Nous base", nous.base.indexOf("nousresearch.com") >= 0);
assert("NOUS_API_KEY infers DeepSeek id", nous.model === "deepseek/deepseek-v4-flash");

const generic = resolveConfig({
  GUEST_DEMO_API_KEY: "k",
  GUEST_DEMO_API_BASE: "https://example.test/v1/",
  GUEST_DEMO_MODEL: "acme-1"
});
assert("generic trio wins", generic.key === "k" && generic.base === "https://example.test/v1" && generic.model === "acme-1");

const overrideNous = resolveConfig({
  NOUS_API_KEY: "nous-test",
  GUEST_DEMO_MODEL: "other/model"
});
assert("GUEST_DEMO_MODEL overrides Nous default", overrideNous.model === "other/model");

const openaiCompat = resolveConfig({
  OPENAI_API_KEY: "sk",
  OPENAI_BASE_URL: "https://inference-api.nousresearch.com/v1"
});
assert(
  "OPENAI_* aliases work against Nous host",
  openaiCompat.keyed && openaiCompat.base.indexOf("nousresearch.com") >= 0
);

const rules = runTool("get_rules", {}, { stay: stay, fixture: e2 });
assert("get_rules exposes zero comp cap", rules.max_comp_php_without_host === 0);

const cal = runTool("calendar_check", { slot: "13:00" }, { stay: stay, fixture: e3 });
assert("calendar_check withdraws eval-3 slot", cal.withdrawn === true && cal.available === false);

const ticket = runTool("open_host_ticket", { topic: "refund" }, { stay: stay, fixture: e2 });
assert("open_host_ticket is stub not money", ticket.money_moved === false);

const stayHit = runTool("get_stay", {}, { stay: stay, fixture: e2, memory: stay.memory_persist });
assert("get_stay omits discard list", stayHit.persist && !stayHit.discard);

const fakeChat = async function (messages) {
  const last = messages[messages.length - 1];
  const askedTools = last.role === "user" && /Guest:/.test(last.content);
  if (askedTools) {
    return {
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_rules",
                type: "function",
                function: { name: "get_rules", arguments: "{}" }
              }
            ]
          }
        }
      ]
    };
  }
  return {
    choices: [
      {
        message: {
          role: "assistant",
          content:
            '{"option_id":"A","call":"act","guest_reply":"Full refund is on the way.","rationale":"Guest wants money now."}'
        }
      }
    ]
  };
};

const out = await proposeWithModel(
  {
    stay: stay,
    fixture: e2,
    memory: stay.memory_persist,
    guest_message: e2.guest_message.text
  },
  { chatFn: fakeChat }
);

assert("fake model returns ok", out.ok === true && out.fallback === false);
assert("fake model wants refund A", out.proposal.option_id === "A" && out.proposal.call === "act");
assert("trace recorded get_rules", out.trace.some(function (t) { return t.tool === "get_rules"; }));

for (const line of lines) console.log(line);
console.log(pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
