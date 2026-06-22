Control Tags
============

This skill uses lightweight XML-style control tags inside its Markdown.
They are instructions to the executing agent, not output. Honor them
exactly as defined here; this file is self-contained and independent of
any other plugin or MCP server.

Placeholders
------------

-   `<xxx>value</xxx>` *sets* the placeholder named `xxx` to `value`.
    Expands to nothing; do not output anything.

-   `<xxx/>` *reads* the placeholder named `xxx` and expands to its
    current value.

Objective
---------

-   `<objective>...</objective>`:
    The skill's single overarching goal. Read it as binding intent, not
    output. Expands to nothing.

Flow Constructs
---------------

-   `<flow>...</flow>`:
    A *sequential flow* of `<step>`s which MUST be executed in exactly
    the given order. Expands to its body.

-   `<step id="<id/>" [condition="..."]>...</step>`:
    One distinct step (here: one PHASE) of a `<flow>`. Execute its body
    completely -- including its closing `<gate/>` -- before moving to the
    next step. With a `condition`, run the step only when it holds, else
    skip it. Expands to its body.

-   `<if condition="...">...</if>`, followed optionally by
    `<elseif condition="...">...</elseif>` and/or `<else>...</else>`:
    Conditional expansion. Expand the body of the first branch whose
    condition is met, otherwise the `<else>` body, otherwise nothing.

-   `<for items="...">...</for>`:
    Repeat the body once per item; inside the body, `<item/>` expands
    to the current item. A `<break/>` stops the repetition early.

-   `<while condition="...">...</while>`:
    Repeat the body as long as the condition is met. A `<break/>`
    stops the repetition early.

Output Templates
----------------

-   `<template>...</template>`:
    The ONLY mechanism for user-visible output. Output the template
    content *exactly* as given (including newlines), expanding only
    control constructs and `<xxx/>` placeholders, and removing
    trailing spaces. Do not output explanations or summaries of your
    own unless a template requests them.

Reusable Blocks
---------------

-   `<define name="x">...</define>`:
    Names a reusable block `x`. Expands to nothing.

-   `<expand name="x"/>`:
    Expands to the body of the matching `<define name="x">` -- use it to
    emit a block in more than one place without repeating it.

Step Announcement
-----------------

The moment a `<step>` begins executing, FIRST emit a one-line banner so
the user can see exactly which phase is active, THEN carry out the phase:

    <phase-marker/> **<step-id/>** — <what this phase decides, one short clause>

`<step-id/>` is the step's `id` (e.g. `PHASE 2: Core Message`).
`<phase-marker/>` is the colored bullet of the WORK PHASE. There are two,
split by the story/slide barrier, so the color shows at a glance whether
the story is still being shaped or the slides are being planned:

| Work phase                               | Steps      | Marker |
| ---------------------------------------- | ---------- | ------ |
| **Story** — briefing, core message, storyline (no slides yet) | PHASE 1–3 | 🔵 |
| **Slides** — messages, titles, content & layout, notes, handoff | PHASE 4–8 | 🟢 |

Emit the banner exactly once per phase entry. These two markers are the
only decoration -- do not invent other status glyphs or colors.

Progress Task List
------------------

So the user always sees where they are in the overall flow, maintain a
visible task list of the phases via the host's task-list facility (in
Claude Code: the Task tools -- TaskCreate / TaskUpdate / TaskList):

1.  **At flow start**, before entering PHASE 1, create one task per
    `<step>` of the `<flow>`, in order, each titled with the phase marker
    and the step `id` (e.g. "🔵 PHASE 1: Briefing"). Create the list once;
    if it already exists from this run, reuse it -- never duplicate.
2.  **On entering a phase**, set its task to in_progress (right after the
    phase-marker banner).
3.  **When a phase's `<gate/>` is approved**, set its task to completed and
    the next phase's task to in_progress.

The task list mirrors the flow as an always-visible map; it never replaces
the phase-marker banner or the gate selection box -- it sits beside them.

Stage Gate
----------

-   `<gate/>`:
    A BLOCKING checkpoint that ends a `<step>`. The flow does NOT advance
    to the next step until the user explicitly approves. Run it like this:

    1.  Emit a **checkpoint**: a short structured summary of what this
        phase produced, followed by an explicit quality-criteria list
        (each marked met / not met).
    2.  Ask the user with the host's **selection box** (the multiple-choice
        question tool) -- never as free prose -- offering at least:
        - **Approve & continue** to the next phase,
        - **Revise** (stay in this phase and refine),
        - **Skip next phase** (only where sensible; show the risk first).
    3.  Act on the choice: on *approve* advance to the next `<step>`; on
        *revise* stay here and iterate, then gate again; on *skip* apply
        the Short-Path protocol from the skill before advancing.

    Stay inside the current phase until the gate is approved -- one phase
    is fully clarified before the next begins. Do not batch two phases
    into one gate.
