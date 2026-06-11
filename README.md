# pptc

**Deterministic PowerPoint (PPTX) CLI for LLM agents.**

`pptc` creates and edits PowerPoint presentations from the command line --
template-aware, schema-validated and atomic. It is designed to be driven by an
LLM agent (e.g. a Claude Code skill): every command emits exactly one JSON
envelope on stdout, every failure has a stable error code and exit code, and
every write either fully applies or leaves the file byte-identical.

```
$ pptc state deck.pptx --level summary
{
  "ok": true,
  "cmd": "state",
  "file": "/work/deck.pptx",
  "rev": "27d7f5a4ea5a",
  "result": { "slideCount": 4, "slides": [ ... ] }
}
```

## Why

Building PPTX files through ad-hoc scripting is fragile for agents: shell
quoting mangles JSON, slide indices shift when users edit between turns,
half-applied edits corrupt decks, and errors arrive as prose. `pptc` fixes
these structurally:

- **One write path.** All mutations are *ops* in a JSON document, validated as
  a whole (Zod schemas) before the first byte is touched, then applied in one
  atomic write. `--dry-run` is the same pipeline without the write.
- **Stable addressing.** Slides are addressed by their OOXML `sldId`
  (`id:257`), exact title (`title:Agenda`), or a document-local `$ref` --
  not by fragile positions (though `index:N` exists as an escape hatch).
- **Optimistic locking.** `state` returns a `rev` token; `apply --rev` (or
  `expectRev` in the document) fails with exit 6 when the deck changed
  underneath.
- **Templates as data.** `tpl describe` turns any `.potx`/`.pptx` into an
  LLM-readable description: per layout an ASCII minimap, semantic positions
  ("linke Spalte, volle Höhe"), text capacities and image aspect ratios --
  derived generically from the OOXML geometry, no template-specific code.
- **Typed failures.** Exit codes per error class, machine-readable
  `error.code`, and Zod issue paths in `error.details` for self-correction.

## Installation

```
npm install -g @brusdeylins/pptc
pptc --version
```

Or without installing: `npx @brusdeylins/pptc ...`. Requires Node.js >= 20.

## Quick Start

```bash
# 1. understand the template (the LLM picks layouts from this)
pptc tpl describe corporate.potx

# 2. create a deck and build it in one run
pptc new deck.pptx --template corporate.potx --ops @ops.json

# 3. read the truth back
pptc state deck.pptx --level full
```

`ops.json`:

```json
{
  "ops": [
    { "op": "slide.add", "ref": "intro", "layout": 0,
      "placeholders": {
        "title":    { "text": "Mein Vortrag" },
        "subtitle": { "text": "Untertitel" }
      },
      "notes": "Begrüßung." },
    { "op": "slide.add", "layout": 4,
      "placeholders": { "title": { "text": "Zahlen" } } },
    { "op": "el.add", "slide": "title:Zahlen", "elements": [
      { "type": "chart", "frame": { "x": 0.7, "y": 1.9, "w": 12, "h": 4.7 },
        "data": { "type": "column", "categories": ["Q1", "Q2"],
                  "series": [{ "name": "Umsatz", "values": [10, 14] }] } }
    ] },
    { "op": "slide.move", "slide": "$intro", "to": 0 }
  ]
}
```

Small fixes need no JSON file:

```bash
pptc text deck.pptx --slide title:Zahlen --ph title "Zahlen 2026"
pptc note deck.pptx --slide id:257 "Neuer Sprechertext"
pptc rm   deck.pptx --slide index:3
pptc apply deck.pptx -e '{"op":"slide.move","slide":"id:257","to":1}'
```

## Command Reference

| Command | Purpose |
|---|---|
| `tpl list <dir>` | inventory of `.potx`/`.pptx` templates in a directory |
| `tpl describe <tpl> [--layout SEL] [--format text\|json]` | LLM-readable layout description (minimaps, capacities, suitability) |
| `tpl inspect <tpl> [--layout SEL]` | precise template JSON (geometry, placeholder map, theme) |
| `tpl validate <tpl>` | check the template against pptc's expectations (exit 7 on failure) |
| `state <deck> [--slide SEL] [--level summary\|text\|full]` | deck read model incl. `rev` token |
| `new <deck> --template <tpl> [--force] [--ops @file]` | create a deck from a template, optionally build it in the same run |
| `apply <deck> (--ops @file\|- \| -e '<op>') [--template <tpl>] [--dry-run] [--strict] [--rev R] [--out F]` | the single write path |
| `text\|note\|footer\|rm\|move` | micro edits -- each compiles to exactly one op |
| `schema [op]` | JSON Schema of an op, generated from the validating Zod schema |
| `update` | self-update via npm |
| `help` | usage summary |

**Slide selectors:** `id:N` (canonical) · `title:...` (exact, must be unique) ·
`index:N` / bare digits (positional) · `$ref` (created earlier in the same ops
document).

**Placeholder keys** in `slide.fill`: the OOXML `idx` (`"13"`), or semantic
keys resolved against the layout: `"title"`, `"subtitle"`, `"body"`,
`"image"`, `"image:14"`, `"text:13"`.

**Payloads:** `--ops @file.json` reads a file, `--ops -` reads stdin, `-e`
takes one inline op. Agents should write the file with their editor tool and
pass `@file` -- that removes shell quoting from the threat model.

## Ops Reference

| Op | Purpose |
|---|---|
| `slide.add` | add a slide from a template layout (`layout`: index or name; optional `ref`, `at`, inline fill) |
| `slide.fill` | fill placeholders (`text`/`image`), `notes`, `footer`, `background` of a slide |
| `slide.rm` / `slide.move` / `slide.copy` | structure edits |
| `el.add` | add free elements: `textbox`, `table`, `chart`, `shape`, `image`, `connector` -- all share `frame: {x,y,w,h}` in inches |
| `el.set` / `el.rm` | retext / remove an element by shape name; matches exactly or as prefix of the engine's UUID-suffixed names (`Kasten` matches `Kasten-1d22c8b0-...`), and also targets elements generated earlier in the same ops document |
| `img.prompts` | overlay picture placeholders with visible image-prompt boxes (removable via `el.rm`) |
| `meta.props` | document properties (title, author, subject, keywords, category, comments) |

Run `pptc schema <op>` for the authoritative JSON Schema with all fields, or
`pptc schema document` for the whole ops document.

### Ops document semantics

- The **whole document is validated and planned first** (schema, every
  selector resolved, capacity lint); mutations run only when everything
  resolved. On failure the envelope carries `failedAt` and the deck is
  byte-identical to before.
- `expectRev` (or `--rev`) enforces the read-before-write protocol: exit 6 on
  mismatch.
- Text capacity is linted against the template geometry; warnings appear in
  the envelope, `--strict` turns them into exit 7.

## Envelope & Exit Codes

Exactly one JSON document on stdout; logs (if any) on stderr.

```json
{ "ok": true,  "cmd": "apply", "file": "...", "rev": { "before": "...", "after": "..." },
  "result": { "applied": 6, "slides": { "intro": { "id": 263, "index": 0 } } },
  "warnings": [ { "code": "W_TEXT_OVERFLOW", "placeholder": 13, "estimatedLines": 14, "maxLines": 12 } ] }
```

```json
{ "ok": false, "cmd": "apply",
  "error": { "code": "E_SCHEMA", "message": "...", "details": { "issues": [ ... ] } } }
```

| Exit | Class | Codes |
|---|---|---|
| 0 | success (possibly with warnings) | |
| 2 | input | `E_USAGE`, `E_SCHEMA`, `E_JSON` |
| 3 | addressing | `E_ADDR_NOTFOUND`, `E_ADDR_AMBIGUOUS` |
| 4 | file/template I/O | `E_FILE`, `E_TEMPLATE` |
| 5 | engine | `E_ENGINE` |
| 6 | revision conflict | `E_REV_CONFLICT` |
| 7 | lint under `--strict` | `E_LINT` |

## Design Decisions

- **Kernel CLI.** Reads are commands, writes are data. An agent is better at
  producing one schema-validated JSON document than at sequencing a dozen
  correct shell invocations -- one validation pass surfaces all errors at
  once, and there is exactly one write schema to maintain.
- **Seed decks.** The engine ([pptx-automizer](https://github.com/singerla/pptx-automizer))
  imports slides, not layouts. For each template pptc derives a *seed deck*
  (one empty cloned-placeholder slide per layout) on demand, cached by
  template content hash -- `slide.add` works with any template.
- **Two-phase apply.** Every op is a pure plan transformer; the engine session
  interprets the finished plan. `--dry-run` is "plan without commit", not a
  separate code path.
- **No silent first-match.** Ambiguous titles, ambiguous placeholder keys and
  unknown refs are errors with candidate lists -- determinism beats
  convenience.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the layer model and data flow.

## Updating

`pptc` checks the npm registry at most once per day (offline-tolerant). When a
newer version exists, every envelope carries an `update` field:

```json
"update": { "current": "0.1.0", "latest": "0.2.0" }
```

An agent (or you) then runs:

```
pptc update
```

This is how a skill built on pptc keeps itself current without user
intervention.

## Development

```
npm install        # dependencies
npm test           # build + vitest (unit, golden, integration, contract)
npm run lint       # eslint (incl. TSDoc) + tsc --noEmit
npm run build      # esbuild bundle -> dst/pptc.mjs
```

## License

MIT -- Copyright (c) 2026 Matthias Brusdeylins
