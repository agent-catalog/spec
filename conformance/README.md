# agent-catalog conformance suite

The normative test suite for `agent-catalog-v1`. Every implementation MUST pass the positive vectors and MUST reject the negative vectors. The discovery vectors test the HTTP-level discovery handshake.

## Running

```bash
pnpm install
pnpm --filter @agent-catalog/conformance test
```

## Layout

- `runner.ts` — TypeScript test harness using ajv
- `positive/` — catalogs that MUST validate against the schema
- `negative/` — catalogs that MUST fail validation, each named after the violation it triggers
- `discovery/` — HTTP request/response fixtures testing the discovery handshake (header precedence, well-known fallback, content negotiation, redirect handling)
