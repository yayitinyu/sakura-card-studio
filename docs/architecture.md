# Architecture

## Modules

```text
app/                    Next.js App Router, global styles, catch-all API
components/ui/          Dialogs and shared inputs
features/editor/        Project workspace, autosave, Monaco, preview
features/character/     Character and greeting editors
features/world/         World editor
features/lorebook/      Lorebook entries and activation settings
features/providers/     Provider settings and model icons
features/agent/         Copilot preview, apply and rejection
features/history/       Revision list and Monaco diff
lib/schema/             Canonical schema and estimates
lib/codecs/             Author text, V2/V3 JSON, PNG
lib/ai/                 Provider adapter, prompts, context and safe patches
lib/server/             SQLite, encryption, bounded requests and logging
scripts/                Monaco build, standalone start, Docker entrypoint
tests/                  Codec/security/regression tests and protocol fixture
```

## Source of truth and persistence

`Canonical` is validated by Zod. It includes character fields, worlds, lorebook, scenario, greetings, prompt, author source and extension storage. Source text is a representation, not the database's independent authoritative model. Invalid source stays editable and does not overwrite valid Canonical data.

`projects.canonical` is the aggregate source of truth. `characters`, `worlds`, `lorebooks`, and `lorebook_entries` are queryable projections rebuilt in the same transaction. `revisions` stores full Canonical snapshots and source labels. `providers` stores validated configuration and encrypted credentials; `model_preferences` stores default/favorite/recent models. `assets` stores image blobs. `agent_runs` records role, model and result; `agent_suggestions` records operations and acceptance/rejection status. `schema_migrations` tracks projection backfills.

Saves use a monotonically increasing project version, a SQLite transaction, and optimistic locking. The client serializes debounced writes and flushes before navigation, format conversion, export and AI requests. A conflicting save returns 409; the server never silently overwrites the newer version. Restoring history creates a new revision.

## Codec boundaries

Author text codecs parse known sections and preserve unrecognized content. YAML/JSON can represent the entire Canonical model; Markdown/XML use structured sections plus metadata for nontext fields. External V2/V3 standard fields override stale embedded snapshots. PNG parsing validates chunk lengths and CRC before decoding. Export writes V2 and V3 chunks and replaces old card chunks while retaining unrelated chunks at codec level; the API normalizes uploaded cover images through sharp.

The V2 numeric lore entry ID constraint is handled by a numeric export ID plus an extension holding the original ID. V3-specific assets/group data survive a V2 round trip in Studio metadata. Unknown extensions are retained where JSON can represent them; this is semantic preservation rather than byte-for-byte file identity.

## AI workflow

1. Flush pending edits and capture the current project version.
2. Select a role: EvidenceExtraction, CharacterArchitect, WorldArchitect, LorebookArchitect, GreetingDirector, DialogueDesigner, ConsistencyReviewer or ImageAnalyst.
3. Build scoped context. Greeting context includes relevant lore entries selected by keyword, rather than blindly sending the entire project.
4. Call the chosen OpenAI-compatible model and validate the structured result. Evidence extraction cannot patch; GreetingDirector must offer 3–6 ideas before a selected idea can produce an opening; ImageAnalyst must separate visible facts.
5. Save the run and suggestions. Send status/result SSE events to the client. No project mutation occurs at this stage.
6. Show before/after, reasons and editable string suggestions. Apply checks stored run identity and project version, restricts paths, rejects prototype keys and validates the entire resulting Canonical object.
7. Commit accepted changes and revision atomically. Independent replacements can be accepted one by one; dependent operations require regeneration after a partial application. Rejection removes the operation from the stored actionable result without changing the project.

The tools capability flag is metadata; no executable agent tool loop is shipped. Role prompts encourage quality, but schema validation cannot prove narrative accuracy or model reasoning quality.

## Security and operations

Credentials are encrypted with random nonces and authenticated AES-GCM, using a key derived with scrypt. The master secret is stable across starts through environment configuration or the persistent secret file. API responses mask keys and exports exclude Provider configuration. Request streaming limits prevent trusting Content-Length alone; image processing enforces byte/pixel limits. Mutating requests reject foreign Origin values.

This is a trusted single-user application without an authentication boundary. Same-origin checks are not access control. Keep the default loopback binding or add authenticated reverse proxy access. SQLite and its WAL are persistent state and must be backed up consistently.
