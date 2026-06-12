# Changelog

## 0.2.5 (plugin 0.2.6)

- Sections handling: `new` strips the template's PowerPoint sections
  (they only group the stripped example slides); `apply` prunes section
  slide references whose slide was removed, so user-created sections
  survive edits without stale refs. Integrity validator checks section
  references.
- `--plain` extended to all read commands: `help`, `state`, `tpl list`
  and `tpl validate` join `tpl describe` (readable text instead of the
  JSON envelope; write commands stay envelope-only).

## 0.2.4 (plugin 0.2.5)

- `tpl describe --plain` prints the raw Markdown without the JSON
  envelope -- a human console escape hatch (agents keep the envelope).

## plugin 0.2.4 (CLI unchanged at 0.2.3)

- The skill bundles a NEUTRAL fallback template (Microsoft's default
  Office design, same provenance as the test fixture) with a sidecar:
  used when the user names no template, always announced as the neutral
  default with a hint that a corporate template can be supplied instead.
  No corporate material involved.

## 0.2.3

- Engine: two more repair triggers eliminated -- (1) `CT_Presentation`
  element order is normalized in the seed builder (notesMaster/handout
  id lists must precede `sldIdLst`; sloppy templates violate this),
  (2) charts, embeddings and media are garbage-collected: automizer
  duplicates chart parts and accumulates stale slide relationships on
  every re-apply (1 chart became 64 across 6 applies); unused slide
  rels are pruned and unreachable assets removed. This also closes the
  documented "media of removed slides remains" limitation.
- Integrity validator: new checks for presentation element order and
  orphan chart/embedding/media parts; stress suite asserts exactly one
  chart part survives repeated applies.
- Test fixture: presentation element order fixed.

## 0.2.2

- Engine: sweep stale and duplicate content-type overrides (another
  PowerPoint "repair" trigger) -- in the post-pass after every apply and
  in the seed builder, so templates carrying override debris of their own
  produce clean decks; `removeParts` now strips ALL matching overrides.
- Tests: new file-integrity validator (`test/util/integrity.ts`) asserting
  every written deck against the known repair triggers -- well-formed XML,
  unique shape ids, no dead relationship targets, no dead/duplicate
  content-type overrides, full content-type coverage, resolvable sldIds;
  wired into the integration, elements and contract suites.
- Test fixture: removed phantom slideMaster2/3 overrides from
  `neutral-template.pptx`.
- Plugin: element slides (tables/charts/shapes via `el.add`) always use
  the blank-role layout (title + empty surface), never layouts with text
  placeholders in the content area.

## 0.2.1

- Plugin: the skill no longer bundles a template -- it works exclusively
  with external `.potx`/`.pptx` templates (path, directory scan with
  selection menu, or explicit ask). Template-specific knowledge lives in
  a sidecar Markdown next to the template file.

## 0.2.0

- Engine fixes (PowerPoint "repair" triggers): drop stale presentation
  relationships after re-apply slide renames, re-point notesSlide
  back-references at the renamed parent slide, and make `cNvPr` shape
  ids unique per slide.
- Built slides now keep the layout's footer, slide-number and date
  placeholders with their content (footer text, `slidenum` field), so
  decks show footer and page number like PowerPoint-inserted slides.
- Decks built from templates saved in master/layout view now open in
  normal view (`lastView` stripped); seed format bumped to 4.
- Claude Code plugin: new `plugin/skills/powerpoint` skill (template-aware
  deck building plus color-faithful image prompts) with bundled `pptc.mjs`,
  marketplace/plugin manifests and the `plugin:sync` npm script.
- Docs: full per-command CLI reference in the README plus an
  "Architecture in a Nutshell" section (automizer / PptxGenJS / zip
  post-pass); ARCHITECTURE.md covers the repair-cleanup duties.

## 0.1.0

Initial release.

- Kernel CLI: `tpl list/describe/inspect/validate`, `state`, `new`, `apply`,
  `schema`, `update`, `help` plus the micro-edit sugar commands
  `text`, `note`, `footer`, `rm`, `move`.
- Ops vocabulary: `slide.add/fill/rm/move/copy`, `el.add/set/rm`,
  `img.prompts`, `meta.props` -- validated by Zod, planned as a whole,
  applied atomically.
- Template intelligence: `tpl describe` derives layouts, ASCII minimaps,
  semantic positions, text capacities and image aspect ratios generically
  from OOXML geometry.
- Determinism: stable slide ids and title selectors, `$ref` for new slides,
  `rev` tokens with optimistic locking, exit codes per error class,
  capacity lint with `--strict`.
- Engine: pptx-automizer + PptxGenJS interop with on-demand seed decks per
  template (content-hash cached) and a zip-level post-pass for notes,
  footers, backgrounds, placeholder images, hyperlinks and properties.
