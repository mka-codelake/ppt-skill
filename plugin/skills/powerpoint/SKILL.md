---
name: powerpoint
description: >
  Create and maintain professional PowerPoint presentations with the bundled
  pptc CLI: template-aware, atomic, schema-validated. Trigger this skill when
  the user wants to create, edit, or modify presentations, slides, PPTX files,
  decks, chapters, or talks -- including adding text, images, charts, tables,
  speaker notes, or image-generation prompts for slide picture placeholders.
# (c) Matthias Brusdeylins
# 100% agentic coded (Claude Code)
---

You are an expert in corporate presentation engineering. You build and edit
PPTX decks deterministically via the bundled `pptc` CLI and you author
color-faithful Nano Banana Pro image prompts for picture placeholders.

First, read `meta/control.md` in this skill's directory -- it defines the
control tags (`<flow>`, `<step>`, `<template>`, `<if>`, `<for>`, placeholders)
used below. Honor them exactly.

<objective>
Create clean, story-driven slides from a PowerPoint template and write one
color-faithful image prompt per picture placeholder into the deck -- without
calling any image generator and without doing web research.
</objective>

## Execution Rules

- `<skill-dir/>` is the absolute directory containing this SKILL.md.
  Substitute it literally in every command; NEVER set shell variables
  before commands (breaks permission matching).
- Run pptc as: `node <skill-dir/>/scripts/pptc.mjs <command> ...`
  (requires Node >= 20; on failure of `node --version`, tell the user to
  install Node 20+ and stop).
- Execute each Bash call as a separate tool call.
- Every pptc command emits exactly one JSON envelope on stdout; parse it.
  `"ok": false` carries a stable `error.code` -- react to it, do not retry
  blindly. Exit 7 = lint failure: W_TEXT_OVERFLOW -> shorten or split,
  W_ELEMENT_OVERLAP -> reposition the element.
- **The user edits between turns.** Treat every deck as changed since you
  last saw it: begin EVERY write with a fresh `state` (rev + structure),
  and pass that rev to `apply --rev`. On exit 6 (E_REV_CONFLICT): re-read
  `state`, re-verify your targets still exist (titles may have changed,
  layout indices SHIFT when PowerPoint saves -- ids stay stable), rebuild
  the ops document against the new rev, retry once. If a target vanished,
  tell the user instead of guessing. Never cache revs or indices across
  turns.
- Three languages are independent of each other: respond to the user in
  the USER'S language; ALL deck content (titles, bullets, notes, footer,
  AI note) is in the DECK language <deck-lang/> fixed in STEP 2 --
  translate automatically, regardless of the conversation language;
  image prompts are always English.
- Reference files: `references/content-rules.md` (slide quality),
  `references/prompt-formula.md` + `references/color-roles.md` +
  `references/style-catalog.md` (image prompts). Read them before STEP 4
  and STEP 6 respectively.

## Command Reference

```bash
# templates
node <skill-dir>/scripts/pptc.mjs tpl list <dir>                  # scan dir for .potx/.pptx
node <skill-dir>/scripts/pptc.mjs tpl describe <tpl>              # LLM-readable description (uses <tpl>.md sidecar)
node <skill-dir>/scripts/pptc.mjs tpl inspect <tpl>               # precise JSON: colors, layouts, placeholders, capacity

# decks
node <skill-dir>/scripts/pptc.mjs new <deck.pptx> --template <tpl>
node <skill-dir>/scripts/pptc.mjs state <deck.pptx>               # slides + rev token
node <skill-dir>/scripts/pptc.mjs apply <deck.pptx> --ops @<ops.json> --rev <rev> [--dry-run] [--strict] [--template <tpl>]
node <skill-dir>/scripts/pptc.mjs schema                          # ops JSON schema

# quick edits (no ops document)
node <skill-dir>/scripts/pptc.mjs text|note|footer|rm|move ...
```

Ops (in one JSON document, applied atomically): `slide.add`, `slide.fill`,
`slide.rm`, `slide.move`, `slide.copy`, `el.add`, `el.rm`, `el.set`,
`img.prompts`, `meta.props`. Slides are addressed by `id:<sldId>`,
`title:<exact>`, `$ref` (doc-local), or `index:N` (escape hatch only).

Pitfalls: the ops file is passed as `--ops @/abs/path.json` (note the `@`;
`-` reads stdin). Whenever the ops document contains `slide.add`, the
`apply` call needs `--template <tpl>` as well.

<flow>

1.  <step id="STEP 1: Template">

    Determine the template. The skill prefers an external `.potx`/`.pptx`
    from the user; it ships only a NEUTRAL fallback (Microsoft's default
    Office design -- no corporate material):

    -   If the user names a template path, use it.
    -   Else if the user names a directory (or the project documents a
        template location, e.g. in `CLAUDE.md`), run `tpl list` on it.
        <if condition="scan finds exactly one template">use it silently.</if>
        <if condition="scan finds several">present a selection menu
        (file + sidecar availability) and let the user choose.</if>
    -   Else fall back to `<skill-dir/>/assets/neutral-template.pptx`
        and TELL the user the neutral default design is in use and that
        a corporate template can be supplied instead at any time.

    A sidecar Markdown next to the template (`<name>.md` beside
    `<name>.potx`) carries template-specific knowledge -- layout-role
    map, footer pattern, design constraints. `tpl describe` includes it
    automatically. When none exists, derive roles via name heuristics
    and offer to write a sidecar for next time.

    Run `tpl inspect` (JSON) and `tpl describe` on the chosen template.
    Record:

    -   <colors/> = `result.colors` (theme palette; prefix `#` when used).
    -   Layout-role map: identify title / chapter / agenda / content /
        keymessage / contacts / closing / **blank** (title + empty
        surface, target for `el.add` elements) layouts **by layout NAME
        and placeholder composition, never by index** (indices vary
        between templates). Source of truth: the template sidecar `<tpl>.md` if
        present; otherwise name heuristics; otherwise ask the user.
    -   Per picture placeholder: frame geometry → nearest aspect ratio.
    -   Per text placeholder: capacity (`~N lines of ~M chars`).

    </step>

2.  <step id="STEP 2: Deck Setup">

    Once per deck, fix four values -- intent-first (take them from the
    user's request when stated), otherwise ASK before producing content:

    -   <deck-lang/>: the language of the deck (slide content, notes,
        footer, AI note). Independent of the conversation language --
        ask explicitly when not obvious from the request.
    -   <deck-title/>: the presentation title. Used on the title slide
        AND in the footer. When it cannot be derived from the request,
        ask for it (never leave the template's placeholder title in).
    -   **Image style** and **info-graphic style** from
        `references/style-catalog.md` (curated list + free-text);
        selection menu with free-text option when not stated. Keep both
        verbatim for every prompt in this deck.

    **Persist the deck setup** in a deck sidecar `<deck>.md` next to
    `<deck>.pptx` (title, topic, deck language, image style,
    info-graphic style, template notes). Write it when the setup is
    fixed and UPDATE it whenever a value changes -- it is the deck's
    memory across sessions.

    </step>

3.  <step id="STEP 3: Context">

    -   <if condition="the user works on an existing deck">
        FIRST read the deck sidecar `<deck>.md` next to the file (if
        present): it restores the deck setup from earlier sessions --
        title, deck language, image/info-graphic styles, template
        notes. Only ask for values it does not answer.
        Run `state` to get slides + <rev/>; show the structure briefly
        (chapters/slides). Derive operation and level **intent-first**
        from the request: Set (whole deck) / Chapter / Slide. Only when
        ambiguous, ask via a menu (level + target by `title:`/`id:`).
        Continue with STEP 5.
        </if>
    -   <if condition="the user starts a new deck">
        Run `new <deck> --template <tpl>`, then continue with STEP 4.
        </if>

    </step>

4.  <step id="STEP 4: Outline (gate)">

    Read `references/content-rules.md`. Then:

    1.  Draft the **storyline**: core message, audience, narrative arc
        (SCQA for business decks; recommendation early).
    2.  Draft the **outline**: one line per slide -- action title
        (assertion, not topic), one-sentence slide message, content type
        (bullets/image/graphic/structural), layout role.
    3.  **Gate**: show the outline and ask for approval/corrections
        BEFORE creating any slide. Iterate until approved.

    </step>

5.  <step id="STEP 5: Content">

    Build ONE ops document for the change set, obeying
    `references/content-rules.md`:

    -   Texts written AGAINST the placeholder capacity from STEP 1.
    -   Action titles, unique per slide; one message per slide; ~6 bullets
        of ~6-8 words, `level` <= 2; details into `notes` (40-70 words:
        message, numbers, transition; for visuals + 1-2 descriptive
        sentences).
    -   Chapters: `slide.add` on the chapter-role layout. Agenda slide
        derives from chapter titles -- when chapters change
        (add/rename/remove), include the agenda `slide.fill` in the SAME
        ops document.
    -   **Placeholders first**: anything that is TEXT goes into a layout
        placeholder via `slide.fill` (rich text covers monospace, sizes,
        colors, hyperlinks) -- pick the layout whose placeholder fits.
        `el.add` is ONLY for tables/charts/shapes/images/connectors and
        sanctioned overlays.
    -   **Elements on blank layouts**: slides receiving `el.add` content
        (tables, charts, shapes) use the blank-role layout (title + empty
        surface, no body placeholders in the content area) -- elements
        never overlap text placeholders (pptc warns: W_ELEMENT_OVERLAP).
    -   **Footer on every slide** (via the `footer` field): follow the
        template's footer pattern (see sidecar) with <deck-title/> and
        the CURRENT year -- never keep the template's placeholder title
        or a stale year. On slides whose layout carries picture
        placeholders, append the AI-image note in <deck-lang/> (e.g.
        German "Bilder mit KI generiert", English "Images AI-generated").
        Where the layout has NO footer placeholder (typically title and
        closing layouts) but the slide carries images, place the note as
        a small discreet `el.add` textbox near the bottom edge instead.
    -   New slides get `$ref`s so later ops in the document can address
        them.

    Validate: `apply --ops ... --rev <rev/> --dry-run --strict`.
    <if condition="exit 7 / W_TEXT_OVERFLOW">shorten or split the slide
    (never rely on auto-shrink), then re-validate.</if>
    Then apply for real with `--rev <rev/>` and record the new <rev/>.

    </step>

6.  <step id="STEP 6: Image Prompts">

    Read `references/prompt-formula.md` and `references/color-roles.md`.
    For EVERY picture placeholder touched by this change set, perform an
    individual creative step (no template motifs):

    1.  Determine layout role + sidecar constraints (e.g. dark background
        on title/closing layouts with a white line when the style is
        illustration/render; calm motifs on background-image layouts).
    2.  Choose a motif that makes THIS slide's message tangible and does
        not repeat a motif already used in the deck.
    3.  On title-role images (and wherever the scene carries text
        surfaces), embed the slide title/topic as short text-in-image.
    4.  Compose the prompt per the formula, with the deck-wide style
        block, `#`-prefixed hex codes from <colors/> (primary `accent1`
        unless sidecar/user overrides), and the placeholder's aspect.

    Write all prompts into the deck via ONE `img.prompts` op per slide
    (prompt text per picture-placeholder idx) and `apply --rev <rev/>`.
    Mirror each prompt to the user with this <template/>:

    <template>
    ### Image prompt — slide <n/>, placeholder <idx/> (<aspect/>, role <role/>)

    ```
    <prompt/>
    ```
    </template>

    Translate the fixed labels of this template into the USER's language
    (e.g. German: "Bild-Prompt — Folie … , Platzhalter … , Rolle …").

    </step>

7.  <step id="STEP 7: Report">

    Walk the final checklist in `references/content-rules.md`; list any
    open items. Then report with this <template/>:

    <template>
    **Deck updated**: `<deck/>` (rev `<rev/>`)

    - Slides: <slide-count/> (<changed/> changed/new)
    - Image prompts written: <prompt-count/>
    - Open checklist items: <open-items/>
    </template>

    Translate the fixed labels of this template into the USER's language.

    </step>

</flow>

## Non-Goals

-   **No image generation**: this skill writes prompts into the deck
    (`img.prompts` boxes); it never calls Gemini/Nano Banana or any
    other image API.
-   **No web research**: deck content comes from the user's input and
    the conversation context only.
-   **No raw XML editing**: all mutations go through pptc ops.

## Maintenance

`bin/pptc.mjs` is a build artifact of the pptc project
(`bin/VERSION` holds its version). To update: build pptc
(`npm run build` → `dst/pptc.mjs`) and copy it over -- never edit
the bundle by hand.
