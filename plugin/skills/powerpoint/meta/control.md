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
