# agent-catalog v1

**Status:** Draft (pre-implementation)
**Revision:** 2026-04-11
**License:** Apache-2.0

## 1. Introduction

`agent-catalog` is an origin-level umbrella manifest format for agent-facing surfaces. A publisher places a single JSON document at a well-known URL (or advertises it via a Link header) describing every API, MCP server, A2A agent, installable skill, SDK, and ingestable documentation that the origin exposes to LLM agents, together with the auth schemes required to use them.

The format is pointer-first: it references existing standards rather than reinventing them. `apis[]` entries reference OpenAPI documents or RFC 9727 api-catalog files. `mcps[]` entries reference MCP SEP-1649 server cards. `agents[]` entries reference A2A `agent-card.json` files. `skills[]` entries reference SKILL.md packages installable via the vercel-labs/skills CLI. `auth.authorization` entries reference RFC 8414 OAuth server metadata. The catalog's unique contribution is aggregation at the origin level, per-resource integrity hashes, optional Sigstore catalog signing, token-budget hints for documentation ingestion, deterministic markdown content negotiation, and a two-layer auth vocabulary separating identity from authorization.

## 2. Conformance language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all capitals, as shown here.

## 3. Discovery

### 3.1 Link header (preferred channel)

Any HTTP response from an HTTPS origin MAY carry a Link header advertising the catalog per RFC 8288:

```http
Link: <https://example.com/agent-catalog.json>; rel="agent-catalog"
```

The target URL MAY be absolute or relative. When this header is present, agents MUST use the advertised URL and MUST NOT perform the well-known fallback fetch described in Section 3.2. The Link header takes precedence because it is per-route and explicit: a publisher serving multiple products under one origin can advertise different catalogs from different routes.

### 3.2 Well-known URL (fallback channel)

If no `Link: rel="agent-catalog"` header has been observed for the origin, agents MUST attempt:

```text
https://<origin>/.well-known/agent-catalog.json
```

per RFC 8615. A 404 at this URL with no prior Link header means the origin does not publish a catalog; this is not an error condition (see Section 3.6).

### 3.3 Transport requirements

Agents MUST NOT honor agent-catalog advertisements over plain HTTP. Agents MUST validate the origin's TLS certificate per standard validation rules. Agents MUST NOT follow a cross-origin redirect without re-validating the discovery channel (Section 3.1 or 3.2) from the redirect target's origin.

### 3.4 Content negotiation

The catalog endpoint MUST respond to `Accept: application/json` with the canonical JSON catalog defined in Section 4. It SHOULD respond to `Accept: text/markdown` with a deterministic markdown projection of the same catalog. When no `Accept` header is present, publishers SHOULD default to `application/json`.

The media types `application/agent-catalog+json` and `text/agent-catalog+markdown` are reserved as future-compatible aliases. Publishers MAY accept them interchangeably with their unregistered counterparts.

### 3.5 Caching

Publishers SHOULD set `Cache-Control` (e.g., `max-age=3600`) on catalog responses. Publishers SHOULD set a strong `ETag` header (e.g., the SHA-256 of the response body). Agents SHOULD cache catalog responses within their declared `max-age` and SHOULD use `If-None-Match` conditional requests on revalidation. Agents MUST refetch the catalog before consuming cached content if the cache has expired per `Cache-Control` directives. The catalog format does NOT carry an internal `expires` or `validUntil` field; HTTP caching is the sole freshness mechanism.

### 3.6 Discovery error handling

Agents MUST handle the following cases distinctly:

- **No catalog:** A 404 at the well-known URL with no `Link: rel="agent-catalog"` header observed from the origin. Not an error; agents proceed without catalog-based discovery.
- **Unknown version:** The catalog is present but its `agentCatalogVersion` value is not recognized by the agent. Agents MUST refuse to consume the catalog and MUST report the version mismatch. The must-ignore rule (Section 4.5) applies to unknown fields within a known version, not to unknown version numbers.
- **Verification failure:** The catalog is present but signature or hash verification fails (when the agent has opted into verification). Agents MUST refuse to consume the catalog and MUST report which check failed.

## 4. Catalog structure

The normative structure is defined by `spec/schema/agent-catalog-v1.schema.json` (JSON Schema draft 2020-12). This section describes the semantics; the schema is authoritative for field types, formats, and constraints.

### 4.1 Top-level fields

**Required:**

- `agentCatalogVersion` — integer, always `1` for v1. Consumers MUST refuse catalogs with any other value.
- `origin` — HTTPS URI (scheme + host + optional port, no path). The origin this catalog describes.

**Optional descriptive:**

- `name` — short display label for the origin.
- `description` — model-native prose describing the origin's agent-facing surface.
- `publisher` — object with `name`, `url`, and `contact` fields.

**Optional typed collections:**

- `apis`, `mcps`, `agents`, `skills`, `sdks`, `docs` — arrays of typed entry objects (see Section 4.3). Empty collections SHOULD be omitted rather than serialized as `[]`.
- `auth` — object with `identity` and `authorization` arrays (see Section 4.3.7).

**Optional integrity:**

- `signature` — Sigstore bundle or `null`. See Section 5.3.

### 4.2 Common entry envelope

Every entry in every typed collection shares the following fields. The schema's `$defs/commonEntryFields` is authoritative.

**Required on every entry:**

- `id` — stable, lowercase-alphanumeric-and-hyphen identifier, unique within this catalog. Used for cross-entry references (Section 4.4).
- `name` — short display label.
- `description` — model-native prose. See Section 1 of the Best Practices document for style guidance.

**Optional on every entry:**

- `whenToUse` — brief hint for the model about when this entry is relevant.
- `hash` — `sha256:<64 lowercase hex digits>` of the referenced resource. SHOULD be present when the referenced content is fetchable and stable (see Section 5.2).
- `tags` — array of free-form label strings.
- `requires` — object with optional `identity` and `authorization` string fields, each naming an entry by `id` in `auth.identity[]` or `auth.authorization[]` respectively (see Section 4.4). NOT available on `auth.identity[]` and `auth.authorization[]` entries themselves.

### 4.3 Entry types

#### 4.3.1 `apis[]`

Describes an API or API index available at this origin. The schema's `$defs/apiEntry` is authoritative.

**Required (in addition to common envelope):**

- `format` — one of `openapi`, `asyncapi`, `graphql`, `grpc`, `api-catalog`.
- `url` — HTTPS URI pointing at the API description document.

When `format` is `api-catalog`, `url` SHOULD point at an RFC 9727 `/.well-known/api-catalog` document. The `api-catalog` format is RECOMMENDED when the publisher already hosts one; direct format pointers are the fallback.

#### 4.3.2 `mcps[]`

Describes a Model Context Protocol server. The schema's `$defs/mcpEntry` is authoritative.

**Required (in addition to common envelope):**

- `transport` — one of `stdio`, `http`, `sse`.

For `transport: http` or `transport: sse`, `url` (HTTPS URI) MUST be present. For `transport: stdio`, `command` (string) MUST be present; `args` (string array) is optional. Both `url` and `command` MUST NOT be present simultaneously.

**Optional:**

- `install` — object keyed by package-manager prefix (`npm`, `pypi`, `cargo`, etc.) with package coordinate strings as values. Used by agents to install stdio MCPs.
- `card` — HTTPS URI pointing at an MCP SEP-1649 `/.well-known/mcp.json` server card. When present, this is the RECOMMENDED source of truth for the MCP server's full definition; the inline catalog fields exist for backwards compatibility with publishers not yet hosting an SEP-1649 card.

#### 4.3.3 `agents[]`

Describes an A2A agent published at this origin. The schema's `$defs/agentEntry` is authoritative.

**Required (in addition to common envelope):**

- `card` — HTTPS URI pointing at the A2A `/.well-known/agent-card.json` for this agent.

The A2A card at `card` contains the full agent definition. The catalog's sole function for `agents[]` entries is to enumerate multiple A2A cards under one origin — an aggregation gap that the A2A specification explicitly leaves open.

**Note on naming:** The A2A `agent-card.json` format has a `skills` field that describes protocol operations (RPC-method-shaped operations with input/output JSON Schemas). This is unrelated to the catalog's `skills[]` collection (Section 4.3.4). Consumers MUST NOT interpret an A2A card's `skills` field as catalog `skills[]` entries. See Best Practices Section 2 for a full explainer.

#### 4.3.4 `skills[]`

Describes an installable agent skill in SKILL.md format (Anthropic Agent Skills open standard). The schema's `$defs/skillEntry` is authoritative.

**Required (in addition to common envelope):**

- `source` — source identifier compatible with the vercel-labs/skills CLI. May be `owner/repo`, a full URL, a subpath, or a git URL.
- `pinned` — boolean. `true` means the `source` string contains a commit SHA and the content is content-addressed; `false` means a moving ref.

When `pinned` is `true`, `commit` MUST be present (lowercase hex, 7–40 characters) and `hash` SHOULD be present. When `pinned` is `false`, `hash` MUST NOT be present. Agents MAY refuse `pinned: false` entries based on their configured trust posture.

Installation is delegated to `npx skills add <source>`.

#### 4.3.5 `sdks[]`

Describes a client SDK published by the origin. The schema's `$defs/sdkEntry` is authoritative.

**Required (in addition to common envelope):**

- `language` — programming language or runtime string (e.g., `typescript`, `python`).
- `package` — package coordinate in `<manager>:<name>[@version]` format. Recognized manager prefixes: `npm`, `pypi`, `cargo`, `gomod`, `gem`, `maven`, `nuget`, `composer`.

**Optional:** `docs` — URI pointing at the SDK's documentation.

#### 4.3.6 `docs[]`

Describes a markdown document intended for agent context ingestion. The schema's `$defs/docEntry` is authoritative.

**Required (in addition to common envelope):**

- `url` — HTTPS URI for the document.

**Optional:**

- `tokens` — integer, advisory token count computed against a widely-used tokenizer. Agents treat this as a budget hint; it is not a strict bound.
- `purpose` — free-form tag. Recognized values include `billing`, `rate-limits`, `getting-started`, `error-codes`, `auth-flow`, but the field is open-ended. Publishers MAY point a `docs` entry at an existing `llms.txt` or `AGENTS.md` document; the catalog does not reinvent those formats.

#### 4.3.7 `auth.identity[]` and `auth.authorization[]`

The two-layer auth model is described in Section 6. The schema's `$defs/authIdentityEntry` and `$defs/authAuthorizationEntry` are authoritative for field structure.

Both identity and authorization entries require `id`, `scheme`, and `description`. The `id` is used for cross-entry references via the `requires` field (Section 4.4).

**Recognized identity schemes** (`auth.identity[].scheme`):

- `web-bot-auth` — RFC 9421 HTTP Message Signatures per the IETF Web Bot Auth draft. Optional `keyDirectoryUrl` field is an informational hint; key discovery still follows the Web Bot Auth specification.
- `jwt-attestation` — vendor-issued JWT (e.g., from Anthropic, OpenAI, Google). Entry SHOULD declare accepted `iss` and `aud` values.
- `anonymous` — publisher accepts callers with no identity proof. Distinct from the absence of any identity requirement.

**Recognized authorization schemes** (`auth.authorization[].scheme`):

- `oauth2` — OAuth 2.0. Entry SHOULD include `metadataUrl` pointing at an RFC 8414 `/.well-known/oauth-authorization-server` document. The catalog does not re-encode OAuth metadata; it points at it.
- `api-key` — API key. Entry SHOULD declare `header` (header name) and `obtainAt` (URL for obtaining a key).
- `none` — publisher accepts any identified caller. Distinct from the absence of any authorization requirement.

All `scheme` values are extensible; the recognized values above are first-class in v1. Custom scheme strings are allowed.

### 4.4 Cross-references

The `requires` field on any non-auth entry references auth entries within the same catalog:

```json
"requires": { "identity": "web-bot-auth-main", "authorization": "oauth-main" }
```

Each value MUST match the `id` of an entry in `auth.identity[]` or `auth.authorization[]` respectively. Either subfield is optional; omitting it means no requirement at that layer. Cross-catalog references are not supported in v1.

### 4.5 Must-ignore rule

Consumers MUST tolerate unknown fields within a catalog whose `agentCatalogVersion` they recognize. Unknown fields in any position MUST be silently ignored. This rule enables additive v1 revisions (new optional fields, new entry types) without breaking existing consumers. Unknown `agentCatalogVersion` values are not subject to this rule; they MUST be refused (Section 3.6).

## 5. Trust and integrity

The catalog is a remote-code-execution invitation: it tells agents to install MCP servers, run install commands, and ingest documents into context. Trust is layered.

### 5.1 TLS (MUST)

Agents MUST refuse catalogs served over plain HTTP. Agents MUST validate the publishing origin's TLS certificate. Agents MUST refuse cross-origin redirects without re-validating the discovery channel from the redirect target's origin (Section 3.3). TLS is the minimum trust floor and the only guarantee a publisher who takes no other action provides.

### 5.2 Per-resource SHA-256 hashes (SHOULD)

Every entry whose referenced content is fetchable and stable SHOULD carry `hash: "sha256:<64 lowercase hex digits>"`. The reference server generates these automatically at publish time. When an agent fetches a referenced resource, it MUST verify the hash and MUST refuse the resource on mismatch. Hash verification failure is entry-fatal, not catalog-fatal (see Section 5.5).

Hashes are SHOULD rather than MUST because some references are unavoidably moving: skill entries with `pinned: false` cannot be hashed, and MCP server binaries may update independently of the catalog.

### 5.3 Catalog signing (SHOULD)

The optional top-level `signature` field carries a signing bundle for the JCS-canonicalized catalog (RFC 8785). Publishers SHOULD sign using Sigstore, which ties the signature to a transparency-log entry rooted in OIDC identity. PGP and minisign are allowed; the `scheme` subfield of the signature object identifies the algorithm.

When `signature` is `null` or absent, the catalog is unsigned; the two representations are equivalent.

When a catalog is signed, agents that have opted into verification MUST fetch and verify the transparency log entry, MUST verify the signing identity against a configured allowlist, and MUST refuse the catalog on failure.

Signing protects against catalog tampering between publish time and consumption time (compromised CDN, misbehaving proxy, stale cached substitution). It does NOT protect against publisher origin compromise: a stolen signing key or OIDC identity yields valid-looking but malicious signatures.

### 5.4 The `pinned` flag for skill entries

Skill entries carry a mandatory `pinned` boolean:

- `pinned: true` — the `source` string contains a commit SHA; the content is content-addressed. `commit` MUST be present; `hash` SHOULD be present.
- `pinned: false` — the `source` string is a moving ref. `hash` MUST NOT be present. Cautious agents MAY refuse `pinned: false` entries.

### 5.5 Verification flow

When an agent fetches a catalog, the recommended verification sequence is:

1. **TLS check** (MUST). Refuse on certificate failure.
2. **Schema validation** (MUST). Refuse on `agentCatalogVersion` mismatch or JSON Schema violation.
3. **Signature check** (when signature is present and agent has opted in). Refuse on Sigstore or other signing failure. This is catalog-fatal.
4. **Per-entry hash check** (deferred until each resource is fetched). Refuse the individual entry on hash mismatch; do not invalidate the whole catalog. This is entry-fatal.
5. **`pinned: false` policy check** (per agent). Refuse or accept based on the agent's configured trust posture.

Failures at steps 1–3 are catalog-fatal. Failure at step 4 is entry-fatal. This separation lets agents consume the verifiable portions of a catalog even when a single entry has rotated or broken.

## 6. Two-layer auth model

Identity and authorization are separate concerns and are kept separate in this spec. **Identity** (`auth.identity[]`) tells the publisher who is calling — cryptographic proof of agent identity, vendor attestation, or anonymous. **Authorization** (`auth.authorization[]`) tells the publisher what the caller is allowed to do — OAuth scopes, API key tier, public access.

The layers compose orthogonally. An entry in `apis[]` may require both an identity and an authorization scheme (`requires: { identity: "...", authorization: "..." }`), either alone, or neither. Absence of a `requires` field means no auth requirement at either layer.

The catalog is a declaration of auth requirements, not a runtime auth implementation. The catalog tells an agent which schemes a publisher accepts and where to find the metadata it needs (key directory, OAuth server metadata). Agents implement Web Bot Auth, OAuth, API key headers, and so on independently.

**MCP transport caveat:** Web Bot Auth applies to MCP entries with `transport: http` or `transport: sse`. It is not applicable for `transport: stdio` — stdio MCPs are launched as a subprocess by the agent, so there is no HTTP request to sign. Publishers MUST NOT declare a `web-bot-auth` identity requirement on `stdio` MCP entries.

**Web Bot Auth draft status:** The IETF Web Bot Auth draft (`draft-meunier-web-bot-auth-architecture`) remains an Internet-Draft as of this document's revision date. The underlying RFC 9421 HTTP Message Signatures is a finalized RFC. Publishers SHOULD treat Web Bot Auth as production-ready (it has multiple implementations) but SHOULD note its draft status in their own documentation.

## 7. Conformance

### 7.1 Catalog conformance

A catalog is **v1-compliant** if:

- It is valid JSON.
- It validates against `spec/schema/agent-catalog-v1.schema.json`.
- `agentCatalogVersion` is exactly `1`.
- All `requires` cross-references resolve to entries that exist in the same catalog.
- It is served over HTTPS at `/.well-known/agent-catalog.json` or via a `Link: rel="agent-catalog"` header from an HTTPS origin.

Signing, hashes, populated descriptions, and populated optional fields are SHOULD-level; a catalog omitting all of them is still compliant.

### 7.2 Consumer conformance

A consumer is **v1-compliant** if:

- It implements the discovery handshake correctly: Link header takes precedence, `/.well-known/agent-catalog.json` is the fallback, HTTPS only.
- It refuses catalogs whose `agentCatalogVersion` is not recognized.
- It applies the must-ignore rule for unknown fields within a known version.
- It refuses cross-origin redirects without re-validating discovery from the redirect target's origin.
- It respects standard HTTP `Cache-Control` and `ETag` semantics.
- When it claims to verify signatures or hashes, it implements verification correctly per Section 5.

A consumer is not required to implement every entry type. A consumer that processes only `docs` entries is fully v1-compliant if it correctly ignores other entry types.

### 7.3 The conformance test suite

The directory `spec/conformance/` contains the normative test suite:

- `positive/` — JSON catalogs that MUST validate against the schema.
- `negative/` — JSON catalogs that MUST fail validation, each named after the violation it triggers.
- `discovery/` — HTTP request/response fixtures for the discovery handshake.

Implementations MUST pass all positive vectors and MUST reject all negative vectors. An implementation that fails any conformance vector is non-compliant regardless of documentation claims.

## 8. Versioning and evolution

### 8.1 Wire-format version

`agentCatalogVersion` is a single integer. There is no minor or patch component. The only value defined by this document is `1`.

### 8.2 Backward-compatibility commitments

All changes within v1 MUST be backward-compatible: new optional fields, new entry types, new recognized scheme values, new `purpose` values, new `format` values. A catalog valid against v1 today MUST remain valid against any future v1 revision. A consumer compliant with v1 today MUST be able to consume any v1 catalog regardless of which revision introduced the fields it contains.

v2 is reserved for genuinely incompatible changes: removing an entry type, changing required field semantics, changing the signing scheme in a way that invalidates v1 verification, or changing the discovery handshake. The spec authors commit to extreme conservatism about any v2 declaration. v1 will remain the canonical version for at least 18 months after first publication. Any v2 draft will be announced at least 6 months before any v2 launch with a backward-compatibility migration guide.

### 8.3 Spec document revisions

The spec document carries a **Revision** date stamp in addition to the wire-format version number. The version identifies the wire format; the date stamp identifies the prose revision for changelog purposes.

### 8.4 Errata

Errors in the spec document (typos, incorrect cross-references, ambiguities that do not affect wire format compatibility) are corrected in dated revisions without changing `agentCatalogVersion`. Errata are recorded at the front of the spec document with their revision date.

### 8.5 The relationship between the spec and the reference implementation

When the spec and the reference implementation disagree, the spec wins. The reference implementation is illustrative, not authoritative. Disagreements are resolved by adding a conformance vector to `spec/conformance/`; whichever side fails the vector must change.

## 9. IANA considerations

This section documents media types, well-known URI suffixes, and link relations used by this specification. These are aspirational registrations; they are to be formally requested if this specification progresses through IETF channels. They are not currently registered.

**Media types:**

- `application/agent-catalog+json` — canonical JSON catalog (alias for `application/json` in this context).
- `text/agent-catalog+markdown` — markdown projection of a catalog (alias for `text/markdown` in this context).

**Well-known URI suffix:** `agent-catalog.json` — to be registered per RFC 8615 if the spec progresses through IETF.

**Link relation:** `agent-catalog` — used in `Link` headers per RFC 8288 to advertise a catalog from any HTTP response. To be registered in the IANA Link Relation Types registry.

## 10. Security considerations

**Layered trust model.** TLS (Section 5.1) is the minimum trust floor. Per-resource hashes (Section 5.2) protect against resource substitution between publish time and consumption time. Catalog signing (Section 5.3) protects against catalog tampering in transit or cache. No layer protects against publisher origin compromise; a stolen signing key or certificate yields indistinguishable malicious catalogs.

**Moving references.** Hashes are SHOULD rather than MUST because some catalog entries reference content that moves: skill entries with `pinned: false`, MCP server binaries. Agents SHOULD treat unhashed or unpinned entries as less trustworthy and MAY refuse them based on policy.

**Web Bot Auth draft status.** The identity layer's recommended scheme (`web-bot-auth`) is based on a finalized RFC (RFC 9421) but the Web Bot Auth draft itself remains an IETF Internet-Draft. Publishers SHOULD treat it as production-ready but SHOULD document its draft status to their users.

**Credential exposure.** The catalog MUST NOT contain credentials, tokens, API keys, or secrets of any kind. Hash values and signature bundles are integrity metadata, not secrets.

**Remote code execution surface.** `skills[]` and `mcps[]` entries instruct agents to install and run code. Agents SHOULD verify hashes and signing for these entry types before installation. Agents SHOULD refuse `pinned: false` skill entries in high-assurance contexts.

**Cross-origin redirects.** Agents MUST re-validate the discovery channel after any cross-origin redirect to prevent a compromised intermediate origin from substituting a malicious catalog.

## 11. Normative references

- **[RFC2119]** Bradner, S., "Key words for use in RFCs to Indicate Requirement Levels", BCP 14, RFC 2119, March 1997.
- **[RFC8174]** Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words", BCP 14, RFC 8174, May 2017.
- **[RFC8288]** Nottingham, M., "Web Linking", RFC 8288, October 2017.
- **[RFC8414]** Jones, M., Sakimura, N., Bradley, J., "OAuth 2.0 Authorization Server Metadata", RFC 8414, June 2018.
- **[RFC8615]** Nottingham, M., "Well-Known Uniform Resource Identifiers (URIs)", RFC 8615, March 2019.
- **[RFC8785]** Rundgren, A., Jordan, B., Erdtman, S., "JSON Canonicalization Scheme (JCS)", RFC 8785, June 2020.
- **[RFC9264]** Wilde, E., Lanthaler, M., "Linkset: Media Types and a Link Relation Type for Link Sets", RFC 9264, July 2022.
- **[RFC9421]** Backman, A., Richer, J., "HTTP Message Signatures", RFC 9421, February 2024.
- **[RFC9727]** Bormann, C., "The `/.well-known/api-catalog` Well-Known URI", RFC 9727, June 2025.
- **[OpenID.Discovery]** Sakimura, N., et al., "OpenID Connect Discovery 1.0".
- **[JSON-Schema-2020-12]** Wright, A., et al., "JSON Schema: A Media Type for Describing JSON Documents", draft 2020-12.
- **[SKILL.md]** Anthropic Agent Skills open standard, December 2025.
- **[A2A-AgentCard]** Google, "A2A Agent Card specification", a2a-protocol.org.
- **[Sigstore]** Sigstore bundle format, sigstore.dev.
- **[WebBotAuth]** Meunier, T., et al., "Web Bot Auth Architecture", draft-meunier-web-bot-auth-architecture (Internet-Draft, draft status; see datatracker.ietf.org for current revision).

## 12. Informative references

- **[MCP-SEP-1649]** MCP SEP-1649, `/.well-known/mcp.json` MCP Server Cards (in progress).
- **[llms.txt]** Howard, J., "A standard for LLMs", llmstxt.org.
- **[AGENTS.md]** Linux Foundation Agentic AI Foundation, "AGENTS.md standard", December 2025.
- **[RFC9116]** Foudil, E., Shafranovich, Y., "A File Format to Aid in Security Vulnerability Disclosure", RFC 9116, April 2022.
- **[robots.txt]** Koster, M., "A Standard for Robot Exclusion" (informative; orthogonal to agent-catalog).
- **[NANDA]** MIT NANDA Index / AgentFacts, alternative agent identity and discovery effort.
- **[vercel-labs-skills-cli]** vercel-labs/skills, the `skills` npm package (`npx skills add`), canonical installer for SKILL.md skills referenced from `skills[]` entries.
- **[vercel-labs-agent-skills]** vercel-labs/agent-skills, the published skill collection; distinct from the CLI repository.

## Appendix A: Schema (non-normative)

The canonical JSON Schema for v1 is at `spec/schema/agent-catalog-v1.schema.json` in this repository. It is JSON Schema draft 2020-12 and is authoritative for all structural constraints described in Section 4. When prose in this document and the schema disagree on structure, the schema wins.

Publishers and consumers SHOULD validate against the schema directly rather than implementing field parsing from the prose descriptions in Section 4. The reference server and SDKs both validate against this schema file.
