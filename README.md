# agent-catalog spec

The normative specification for agent-catalog v1 — an origin-level umbrella manifest format that lets any website publish a single document describing every agent-facing surface it exposes: APIs, MCP servers, A2A agents, installable skills, SDKs, and ingestable documentation.

## What's in this repo

**`spec.md`** — the normative spec. Covers the discovery handshake (Link header + well-known URL fallback), the full catalog schema with all seven entry types, the two-layer auth model (identity vs authorization), trust and integrity (per-resource SHA-256 hashes + optional Sigstore signing), versioning commitments, IANA considerations, and security considerations. Written with BCP 14 (RFC 2119/8174) conformance language throughout.

**`best-practices.md`** — non-normative guidance. Covers description style (write for models, not marketing), the A2A/catalog skills naming collision, cross-cutting patterns (billing docs, rate limit docs, webhooks), and worked examples for common deployment shapes (docs-only, API + MCP, full stack).

**`schema/agent-catalog-v1.schema.json`** — the canonical JSON Schema (draft 2020-12). Authoritative for structural constraints. Both the reference server and both SDKs validate against this file.

**`conformance/`** — the normative test suite:
- `positive/` — catalogs that MUST validate
- `negative/` — catalogs that MUST fail, each named for the violation
- `discovery/` — HTTP request/response fixtures for the discovery handshake
- `runner.ts` — the conformance runner (vitest + ajv)

## The format in brief

A publisher drops one JSON file at `/.well-known/agent-catalog.json` (or advertises it via a `Link: rel="agent-catalog"` header). That file has seven typed collections pointing at existing standards:

| Collection | Points at |
|---|---|
| `apis[]` | OpenAPI, AsyncAPI, GraphQL, gRPC, or RFC 9727 api-catalog |
| `mcps[]` | MCP servers (stdio / http / sse), optionally with SEP-1649 card |
| `agents[]` | A2A `agent-card.json` files |
| `skills[]` | SKILL.md installable skill packs (via `npx skills add`) |
| `sdks[]` | Client SDKs by language and package coordinate |
| `docs[]` | Markdown documents for agent context ingestion |
| `auth` | Identity (`web-bot-auth`, `jwt-attestation`, `anonymous`) and authorization (`oauth2`, `api-key`, `none`) schemes |

Only `agentCatalogVersion` and `origin` are required. A minimal catalog is two fields. The rest is opt-in.

## Running the conformance suite

```bash
pnpm install
pnpm test
```

## Related repos

- [agent-catalog/server](https://github.com/agent-catalog/server) — reference server and CLI (`npx agent-catalog`)
- [agent-catalog/sdk-typescript](https://github.com/agent-catalog/sdk-typescript) — TypeScript consumer SDK
- [agent-catalog/sdk-python](https://github.com/agent-catalog/sdk-python) — Python consumer SDK
- [agent-catalog/examples](https://github.com/agent-catalog/examples) — gold-standard example deployment
- [agent-catalog/meta-skills](https://github.com/agent-catalog/meta-skills) — SKILL.md authoring suite
