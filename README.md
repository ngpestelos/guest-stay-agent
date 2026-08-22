# Guest stay agent

Demo of a dual-layer guest agent. Not a product.

The model proposes. A separate policy decides. The agent can answer from the stay. It cannot refund money or fake a confirmation. A host can override the money gate. A withdrawn calendar slot cannot be overridden into a confirmation.

## Run

```bash
export XAI_API_KEY=...   # optional; a local stand-in proposes if unset
node scripts/guest-demo-server.mjs
```

Open http://127.0.0.1:8765/guest-demo/ and press **Play**.

The server binds `127.0.0.1` only. Do not open `file://`. Keep the API key in the environment, not in the page.

## Tests

No browser and no API key:

```bash
node scripts/run-guest-tests.mjs
node scripts/run-guest-propose-tests.mjs
```

## License

MIT. See [LICENSE](LICENSE).
