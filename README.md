# Guest stay agent

Demo of a dual-layer guest agent. Not a product.

The model proposes. A separate policy decides. The agent can answer from the stay. It cannot refund money or fake a confirmation. A host can override the money gate. A withdrawn calendar slot cannot be overridden into a confirmation.

## Run

Any OpenAI-compatible chat API. A local stand-in proposes if no key is set.

```bash
# Generic (Nous example)
export GUEST_DEMO_API_KEY=...
export GUEST_DEMO_API_BASE=https://inference-api.nousresearch.com/v1
export GUEST_DEMO_MODEL=deepseek/deepseek-v4-flash

# Or a known key name (base and model inferred)
export NOUS_API_KEY=...
# export XAI_API_KEY=...
# export OPENAI_API_KEY=...   # also set OPENAI_BASE_URL if not api.openai.com

node scripts/guest-demo-server.mjs
```

A repo-root `.env` is loaded if present (not committed).

Open http://127.0.0.1:8765/ and press **Play**. Reload to get a different stay story (FAQ → money gate + host override → withdrawn slot).

The server binds `127.0.0.1` only. Do not open `file://`. Keep the key in the environment, not in the page.

`OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` are aliases for the `GUEST_DEMO_*` trio.

## Live

https://guest-stay-agent.nestor-c85.workers.dev/  
https://guest-agent-demo.ngpcloud.org/

Cloudflare Worker + static assets. Secrets stay in Wrangler, not in the page.

```bash
npx wrangler secret put NOUS_API_KEY
./scripts/deploy.sh
```

## Tests

No browser and no API key:

```bash
node scripts/run-guest-tests.mjs
node scripts/run-guest-propose-tests.mjs
```

CI on push/PR (`ci` check). Deploy on `main` when `CLOUDFLARE_API_TOKEN` is set as a GitHub Actions secret. Dependabot weekly for Actions; non-major PRs auto-merge after `ci` is green.

## License

MIT. See [LICENSE](LICENSE).
