# Guest stay player

Static page in `public/`. Local: `scripts/guest-demo-server.mjs`. Live: Cloudflare Worker at guest-agent-demo.ngpcloud.org.

**Play** runs:

1. Easy question — agent answers from the house manual
2. Refund demand — agent wants to pay; policy blocks
3. Host override — host refunds; agent still could not
4. Calendar slot gone — no fake confirmation

Policy lives in `policy.js`. The model never sits in the gate.
