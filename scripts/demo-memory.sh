#!/usr/bin/env bash
# Live demo: server-side gate + real persisted memory, run against the
# deployed Worker. Narrates itself — read the echo lines aloud as it runs.
#
# Usage: ACT_DEMO_KEY=... ./scripts/demo-memory.sh
set -euo pipefail

if [ -z "${ACT_DEMO_KEY:-}" ]; then
  echo "Set ACT_DEMO_KEY first: export ACT_DEMO_KEY=..." >&2
  exit 1
fi

HOST="https://guest-agent-demo.ngpcloud.org"
BOOKING="SH-18422"

step() { echo; echo "### $1"; echo; }
mem() { curl -s -H "X-Act-Key: $ACT_DEMO_KEY" "$HOST/api/act/memory?booking_id=$BOOKING" | python3 -m json.tool; }
act() {
  curl -s -X POST "$HOST/api/act" \
    -H "X-Act-Key: $ACT_DEMO_KEY" -H "Content-Type: application/json" \
    -d "$1"
}

step "1. Memory right now — this is server state, not a browser variable"
mem

step "2. A guest asks something with two legal, in-policy paths — the model has to judge which one actually fits"
act '{"fixture_file":"eval-judgment-late-arrival.json","guest_message":"We land close to 22:30. My mother struggles with lockboxes and dark stairs at night — could someone actually be there to let us in?"}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('model picked option:', d['verdict']['option_id']); print('server-side call:', d['verdict']['call']); print('rationale:', d['proposal']['rationale'][:200] + '...')"

step "3. Read it back on a fresh request — same server, no client state involved"
mem

step "4. Now a money ask — the model can propose whatever it wants, the gate decides"
act '{"fixture_file":"eval-2-escalate.json","guest_message":"AC broke, I want a full refund right now"}' \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('server-side verdict.call:', d['verdict']['call'])
print('ticket (money moved):', d['verdict']['ticket'])
print('ignored_proposer_call (what the model itself said):', d['verdict']['ignored_proposer_call'])
"

step "5. That escalation is now in the audit trail, not just a log line"
mem

step "6. Prove the gate can't be skipped — hit the API directly with no key"
curl -s -X POST "$HOST/api/act" -d '{"fixture_file":"eval-2-escalate.json"}'
echo
