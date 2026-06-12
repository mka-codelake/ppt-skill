Content Rules
=============

Guardrails for clean slides. These are prompt rules enforced while
writing slide content, plus the validation that backs them up.

Titles
------

-   **Action titles**: every slide title states the takeaway, not the
    topic -- `"Umsatz übertrifft Forecast um 12%"`, not
    `"Q3-Ergebnisse"`. Reading ONLY the titles, in order, must tell
    the deck's complete story.
-   **Unique titles**: no two slides share a title (titles are also
    the stable `title:` address for later edits).

Body
----

-   **One message per slide**: the slide's message is fixed as ONE
    sentence in the outline before any content is written. If it does
    not fit one sentence, split the slide.
-   **6x6 guideline**: at most ~6 bullets per slide, ~6-8 words per
    bullet, indent `level` at most 2. No prose paragraphs on slides --
    details go into the speaker notes.
-   **Capacity over instinct**: `pptc tpl describe` states per
    placeholder `~N Zeilen à ~M Zeichen`. Write text AGAINST that
    budget. Validation: `pptc apply ... --dry-run --strict` fails with
    `W_TEXT_OVERFLOW` (exit 7) on overflow -- then SHORTEN or SPLIT,
    never rely on PowerPoint auto-shrink.

Language & footer
-----------------

-   **Deck language**: fixed once in deck setup (ask when not obvious
    from the request), independent of the conversation language. ALL
    deck-facing text -- titles, bullets, notes, footer, AI note -- is
    written/translated into the deck language. Image prompts stay
    English.
-   **Footer on every slide**: the template's footer pattern (see
    template sidecar) with the actual deck title and the CURRENT year.
    Never ship the template's placeholder title ("Titel einfügen") or
    a stale year; ask for the title when it cannot be derived.
-   **AI-image note**: every slide whose layout has picture
    placeholders carries a note that the images are AI-generated, in
    the deck language (de: "Bilder mit KI generiert", en: "Images
    AI-generated"), appended to the footer. Layouts without a footer
    placeholder (typically title/closing) get the note as a small
    discreet textbox near the bottom edge instead (`el.add`).

Elements (tables, charts, free shapes)
--------------------------------------

-   Slides that receive free elements via `el.add` ALWAYS use a layout
    WITHOUT text placeholders in the content area (role "blank" --
    title plus empty surface). Elements must never sit on top of body
    placeholders; that layout role comes from the template sidecar or,
    failing that, the layout whose only placeholder is the title.
-   Position elements inside the empty area with explicit `frame`
    coordinates (inches); leave breathing room to the title.

Speaker notes
-------------

-   Every content slide gets notes via the `notes` field: 40-70 words
    covering the core message, key numbers, and the transition to the
    next slide.
-   Slides with charts/images additionally get 1-2 sentences
    describing the visual (doubles as accessibility text).

Structural slides
-----------------

-   **Agenda** derives from the chapter titles, one bullet each. When
    chapters are added/renamed/removed, update the agenda slide in the
    same ops document (`slide.fill` on the agenda slide).
-   **Chapter slides** carry only the chapter title (chapter layout).
-   **Closing slide** carries a call-to-action, not a summary.
-   Business decks follow SCQA where it fits: situation, complication,
    question, answer -- recommendation early, not last.

Final checklist (report unanswered items to the user)
------------------------------------------------------

- [ ] Titles alone tell a coherent story (read in order)
- [ ] Every slide has exactly one message
- [ ] No placeholder over capacity (`--dry-run --strict` passes)
- [ ] Speaker notes present on every content slide
- [ ] Agenda matches the actual chapters
- [ ] Image prompts use template hex codes and the deck-wide styles
- [ ] All slide titles unique
- [ ] All deck text in the deck language (no conversation-language leaks)
- [ ] Footer carries the deck title and the current year on every slide
- [ ] AI-image note present on every slide with picture placeholders
