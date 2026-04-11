# agent-catalog Best Practices (non-normative)

This document is non-normative. It describes what a *good* catalog looks like, beyond what the schema enforces. None of the guidance here gates conformance; a catalog that ignores every recommendation in this document is still a compliant v1 catalog.

## 1. Style: write descriptions in model-native register

The `description` and `whenToUse` fields are read by language models, not humans browsing marketing pages. Write in second person, imperative voice. Be specific. Skip superlatives.

**Bad descriptions:**

```text
✗ "Our state-of-the-art billing API delivers industry-leading performance
  for all your payment processing needs."

✗ "This MCP server is a powerful tool that allows you to leverage the
  full potential of our search infrastructure."
```

**Good descriptions:**

```text
✓ "Query and modify customer billing state, invoices, and payment methods."

✓ "Search Acme's product catalog and knowledge base."
```

The difference: the bad examples describe the product's marketing position; the good examples tell a model what it can do and when. A model deciding whether to call an API will use the description to route — make the routing signal clear.

**`whenToUse` examples:**

```text
✓ "Read this if you receive a 429 from any Acme API."

✓ "Use this when the user asks to look up an Acme invoice or
  update a payment method."

✗ "This comprehensive guide covers all aspects of our rate limiting."
```

`whenToUse` is a dispatch hint. One sentence. Imperative trigger condition.

**Descriptions from the gold-standard vector** (`spec/conformance/positive/gold-standard.json`) follow this pattern throughout. Read it as a style reference before writing your own catalog.

## 2. The skills naming collision (READ THIS)

The catalog's `skills[]` collection and A2A's `skills` field share a name but are **completely unrelated concepts**.

**Catalog `skills[]`** entries describe SKILL.md installable instruction packs — markdown files that teach a model how to perform a task, installed into an agent harness via `npx skills add <source>`. They are not API operations. They are not executable. They are instructions.

**A2A `skills`** (inside an `agent-card.json`) describe protocol operations exposed by an A2A agent endpoint — RPC-shaped operations with input and output JSON Schemas and MIME types. They are roughly analogous to OpenAPI operations.

When you walk a catalog's `agents[]` entries and fetch the A2A `agent-card.json` at each `card` URL, you will find a `skills` array in the A2A card. **Do not treat those as catalog `skills[]` entries.** They are not. They have different schemas, different semantics, and different installation paths. Conflating them will produce broken behavior.

The collision is a naming accident and cannot be resolved in v1 without breaking the A2A specification. Catalog consumers walking `agents[]` entries MUST treat the A2A card's `skills` field as opaque A2A content. Catalog consumers walking `skills[]` entries MUST treat those as SKILL.md sources only.

## 3. Cross-cutting recommendations

Some publisher concerns don't have a first-class entry type. Here is where they belong.

### 3.1 Billing and pricing

Use a `docs` entry with `purpose: billing` pointing at a markdown document describing your pricing model, usage tiers, and billing mechanics. Alternatively, document per-endpoint pricing via OpenAPI extensions on the relevant API description. Do not invent a new catalog entry type for this.

### 3.2 Rate limits and quotas

Use `x-ratelimit-*` extensions in your OpenAPI spec for per-endpoint rate limit declarations. For a human/model-readable policy document, add a `docs` entry with `purpose: rate-limits` and a `whenToUse` like "Read this if you receive a 429 from any Acme API." The gold-standard vector uses exactly this pattern.

### 3.3 Webhooks

Use OpenAPI 3.1's `webhooks` block in your API description. Do not add a separate catalog entry for webhooks. The API entry pointing at your OpenAPI 3.1 document is sufficient; consumers who care about webhooks will find them there.

### 3.4 Telemetry and usage reporting

Out of scope for the catalog. If you want agents to understand your telemetry or usage reporting model, add a `docs` entry pointing at your documentation. The catalog does not carry telemetry configuration or reporting endpoints.

## 4. Worked patterns

### 4.1 Docs-only site

The smallest useful catalog. Populate only `docs[]`. Useful for documentation sites, reference libraries, and any publisher whose agent-facing surface is purely informational.

```json
{
  "agentCatalogVersion": 1,
  "origin": "https://docs.example.com",
  "docs": [
    {
      "id": "getting-started",
      "name": "Getting started",
      "description": "Install and authenticate with the Example SDK.",
      "url": "https://docs.example.com/getting-started.md",
      "tokens": 800
    }
  ]
}
```

If you already publish `llms.txt` or `AGENTS.md`, point a `docs` entry at them. The catalog does not replace those formats; it indexes them.

### 4.2 API-only service

Populate `apis[]` and `auth`. If you publish client SDKs, add `sdks[]`.

```json
{
  "agentCatalogVersion": 1,
  "origin": "https://api.example.com",
  "apis": [
    {
      "id": "main-api",
      "name": "Example API",
      "description": "Create, read, update, and delete Example resources.",
      "format": "openapi",
      "url": "https://api.example.com/openapi.yaml",
      "requires": { "authorization": "oauth-main" }
    }
  ],
  "auth": {
    "authorization": [
      {
        "id": "oauth-main",
        "scheme": "oauth2",
        "description": "Use authorization-code flow for user-scoped access.",
        "metadataUrl": "https://api.example.com/.well-known/oauth-authorization-server"
      }
    ]
  }
}
```

If you already host an RFC 9727 api-catalog at `/.well-known/api-catalog`, set `format: "api-catalog"` and point `url` there instead. One pointer does more than inline repetition.

### 4.3 Multi-MCP origin

Add one `mcps[]` entry per MCP server. For HTTP/SSE servers, include a `card` pointing at the SEP-1649 `/.well-known/mcp.json` when you have one — it is the source of truth for the server's full definition. For stdio servers, populate `install` with package coordinates for each relevant package manager.

The catalog's value here is letting a consumer enumerate all the MCPs from one fetch rather than knowing to probe multiple well-known paths.

### 4.4 Multi-A2A-agent origin

This is the catalog's most distinctive use case. The A2A specification explicitly does not address hosting multiple Agent Cards under one origin. The catalog fills that gap:

```json
{
  "agentCatalogVersion": 1,
  "origin": "https://agents.example.com",
  "agents": [
    {
      "id": "support-agent",
      "name": "Support agent",
      "description": "Handles tier-1 customer support inquiries via A2A.",
      "card": "https://agents.example.com/support/.well-known/agent-card.json"
    },
    {
      "id": "billing-agent",
      "name": "Billing agent",
      "description": "Answers billing and invoice questions, initiates refunds.",
      "card": "https://agents.example.com/billing/.well-known/agent-card.json"
    }
  ]
}
```

Each `card` URL points at a complete A2A agent card. The catalog does not duplicate the card's content — it enumerates them. Consumers fetch individual cards for the full definition.

### 4.5 Full umbrella deployment

See `spec/conformance/positive/gold-standard.json` for the canonical example of a catalog using every entry type: `apis`, `mcps`, `agents`, `skills`, `sdks`, `docs`, and both `auth` layers. That file is the reference for style, field usage, and cross-reference resolution.

## 5. Anti-patterns

**Don't put credentials in the catalog.** No API keys, tokens, passwords, or secrets in any field. Hash values and signature bundles are integrity metadata, not secrets, and are the only key-material-adjacent content allowed. Even for development or testing.

**Don't use `pinned: false` for security-sensitive skills.** An unpinned skill resolves to whatever the source ref points at when the agent installs it. If the skill touches billing, authentication, or other sensitive operations, pin it to a commit SHA and include a hash.

**Don't claim `identity: anonymous` if the underlying API requires an authorization header.** The two auth layers are separate. A route that accepts anonymous identity but still requires an API key is `identity: anonymous` + `authorization: api-key`. Setting `identity: anonymous` with no authorization requirement signals genuinely public access with no credentials at any layer. Misrepresenting this misleads agents and breaks their auth flows.

**Don't write descriptions in marketing register.** "Our state-of-the-art platform delivers unparalleled performance" is not a routing signal. "Query billing records and update payment methods" is. See Section 1.

**Don't try to require Web Bot Auth on stdio MCP entries.** There is no HTTP request to sign for a stdio MCP — the agent launches it as a subprocess. Web Bot Auth only applies to `transport: http` and `transport: sse`. Declaring a `web-bot-auth` identity requirement on a stdio entry will confuse consumers and cannot be satisfied.

**Don't host more than one catalog per origin without using the Link header.** The well-known fallback resolves to one URL per origin. If different routes on your origin serve different products and you want per-route catalogs, use `Link: <url>; rel="agent-catalog"` headers on the relevant responses. The Link header wins over the well-known fallback (Section 3.1 of the spec); this is how per-route disambiguation works.

**Don't use upper-case hex in `commit` fields.** The schema's `commit` pattern is `^[a-f0-9]{7,40}$` — lowercase only, matching git's canonical SHA representation. `ABC123` will fail validation with a confusing error message. Always use lowercase hex; git's default output is lowercase and you should pass it through without transformation.

## 6. Reference relationships

The catalog is strongest when every entry points at an existing standard. Here is the intended pointer graph:

| Entry | Points at |
| --- | --- |
| `apis` with `format: api-catalog` | RFC 9727 `/.well-known/api-catalog` |
| `mcps` with `card` | MCP SEP-1649 `/.well-known/mcp.json` |
| `agents` with `card` | Google A2A `/.well-known/agent-card.json` |
| `skills` with `source` | vercel-labs/agent-skills (or any vercel-labs/skills CLI-compatible source) |
| `auth.authorization` with `scheme: oauth2` | RFC 8414 `/.well-known/oauth-authorization-server` |
| `auth.identity` with `scheme: web-bot-auth` | IETF Web Bot Auth draft, key directory at `/.well-known/web-bot-auth` |
| `docs` | `llms.txt` and/or `AGENTS.md` if published |

When you already publish one of these well-known files, point at it. Don't duplicate its content in the catalog. The catalog's job is enumeration, not re-encoding.
