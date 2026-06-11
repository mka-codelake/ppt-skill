# Changelog

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
