import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const demo = path.join(root, "public");
const context = { console };
context.globalThis = context;
vm.createContext(context);

function load(rel) {
  vm.runInContext(fs.readFileSync(path.join(root, rel), "utf8"), context, {
    filename: rel
  });
}

load("public/policy.js");
load("scripts/guest-tests.js");

const stay = JSON.parse(
  fs.readFileSync(path.join(demo, "fixtures", "stay.json"), "utf8")
);
const pack = JSON.parse(
  fs.readFileSync(path.join(demo, "fixtures", "scenarios.json"), "utf8")
);
const fixtureNames = [];
const seen = new Set();
for (const p of pack.playlists || []) {
  for (const b of p.beats || []) {
    if (b.file && !seen.has(b.file)) {
      seen.add(b.file);
      fixtureNames.push(b.file);
    }
  }
}
const fixtures = fixtureNames.map((name) =>
  JSON.parse(fs.readFileSync(path.join(demo, "fixtures", name), "utf8"))
);

const result = context.runGuestTests(stay, fixtures);
for (const line of result.lines) console.log(line);
console.log(result.pass + " passed, " + result.fail + " failed");
process.exit(result.fail === 0 ? 0 : 1);
