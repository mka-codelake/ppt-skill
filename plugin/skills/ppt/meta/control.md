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

Flow Constructs
---------------

-   `<flow>...</flow>`:
    A *sequential flow* of `<step>`s which MUST be executed in exactly
    the given order. Expands to its body.

-   `<step id="<id/>">...</step>`:
    One distinct step of a `<flow>`. Execute its body completely before
    moving to the next step. Expands to its body.

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

Step Announcement
-----------------

The moment a `<step>` begins executing, FIRST emit a one-line banner so
the user can see exactly where you are, THEN carry out the step:

    <step-marker/> **<step-id/>** — <what you are about to do, one short clause>

`<step-id/>` is the step's `id`. `<step-marker/>` is the colored bullet of
the step's PHASE. There are exactly two phases, so the color tells the user
at a glance whether you are still reading/planning or actively changing the
deck; the step id in the banner names the exact step within the phase:

| Phase                                                | Steps   | Marker |
| ---------------------------------------------------- | ------- | ------ |
| **Analyze** — read state, inspect, set up, plan; no deck mutation | STEP 1–5 | 🔵 |
| **Write** — mutate the deck (`new`/`apply`) and report   | STEP 6–8 | 🟢 |

Emit the banner exactly once per step entry; when a step is skipped by an
`<if>`/route condition, do not emit its banner. These two markers are the
only decoration -- do not invent other status glyphs or colors.
