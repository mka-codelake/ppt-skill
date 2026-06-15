# powerpoint -- Claude Code plugin

Template-aware PowerPoint engineering for Claude Code, built on the
bundled [pptc](../README.md) CLI.

## What the skill does

- **Deck building, outline-first**: storyline and outline are gated for
  your approval before any slide is created.
- **Content guardrails**: action titles, one message per slide,
  capacity-checked text (pptc lint, exit 7 on overflow), speaker notes,
  footer with title/year/AI-image note, agenda kept in sync with
  chapters.
- **Color-faithful image prompts**: one Nano-Banana-Pro prompt per
  picture placeholder, using the template's real theme colors, the
  placeholder's aspect ratio and its overlay regions (covered areas
  become negative space). Prompts are written onto the slides as
  removable boxes -- no image API is called.
- **Edit-safe**: optimistic locking against concurrent PowerPoint
  edits; slides addressed by stable ids and titles, never indices.
- **Per-deck memory**: language, styles and template notes persist in a
  `<deck>.md` sidecar next to the deck.

## Install

```
/plugin marketplace add Brusdeylins/ppt-skill
/plugin install ppt@ppt-skill
```

Requires Node.js >= 20 (the bundled pptc is a Node program). While the
plugin is enabled, `bin/` puts a `pptc` command on the Bash tool's PATH.

## Templates

The skill prefers your external `.potx`/`.pptx` (path or directory
scan); a neutral Office-default template is bundled as fallback. When no
template is named, the skill scans its OWN `assets/` and -- if more than
the neutral default was bundled into this build -- offers a choice among
its bundled templates. Template-specific knowledge (layout roles, footer
pattern, design constraints) lives in a Markdown sidecar next to the
template file -- see `skills/ppt/assets/neutral-template.md` for the
pattern.

Company templates can be bundled into a private, in-house build (see the
CLI repo's `skill:zip:internal`); they are never part of the public
release.

## Layout

```
plugin/
  .claude-plugin/plugin.json   manifest
  bin/pptc                     PATH wrapper
  skills/ppt/
    SKILL.md                   the skill definition
    meta/control.md            control-tag definitions
    references/                content rules, prompt formula, styles
    scripts/pptc.mjs           bundled pptc build (+ VERSION)
    assets/                    neutral fallback template + sidecar
```
