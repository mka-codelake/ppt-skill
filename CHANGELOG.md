# Changelog

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
