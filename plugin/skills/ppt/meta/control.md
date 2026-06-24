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
    One distinct step of a `<flow>`. Execute its body completely before
    moving to the next step. With a `condition`, run the step only when
    it holds, else skip it. Expands to its body.

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
the user can see exactly where you are, THEN carry out the step:

    <step-marker/> **<step-id/>** — <what you are about to do, one short clause>

`<step-id/>` is the step's `id`. `<step-marker/>` is the colored bullet of
the step's PHASE. There are exactly two phases, so the color tells the user
at a glance whether you are still reading/planning or actively changing the
deck; the step id in the banner names the exact step within the phase:

| Phase                                                             | Steps    | Marker |
| ----------------------------------------------------------------- | -------- | ------ |
| **Analyze** — read state, inspect, set up, plan; no deck mutation | STEP 1–5 | 🔵     |
| **Write** — mutate the deck (`new`/`apply`) and report            | STEP 6–8 | 🟢     |

Emit the banner exactly once per step entry; when a step is skipped by an
`<if>`/route condition, do not emit its banner. These two markers are the
only decoration -- do not invent other status glyphs or colors.


Progress Task List
------------------

So the user always sees where they are in the flow, maintain a visible
task list of the steps via the host's task-list facility WHEN THE HOST
PROVIDES ONE (in Claude Code: the Task tools -- TaskCreate / TaskUpdate /
TaskList). Where the host has no task-list facility (e.g. the claude.ai web
chat), SKIP the task list -- do not fake it as text; the step banner and the
gate question orient the user on their own:

1.  **When a run traverses the full flow** (a new deck, or a major
    addition that goes through the outline gate), create one task per
    `<step>` at the start, in order, each titled with the step marker and
    `id` (e.g. "🔵 STEP 1: Current State"). Create it once per run; reuse
    an existing list rather than duplicating.
2.  **On entering a step**, set its task to in_progress (right after the
    step banner); **when the step finishes** -- its `<gate/>` approved, or
    for a gateless step its body done -- set it completed and move the next
    step to in_progress.
3.  **A step skipped** by an `<if>`/route condition is marked completed
    with a "skipped" note, so the map stays honest.
4.  **For a single small scoped edit** that touches only a step or two,
    skip the task list -- it would be noise; use it when the run spans the
    flow.

The task list mirrors the flow as an always-visible map; it never replaces
the step banner or the gate's question -- it sits beside them.


Asking the User
---------------

Whenever a step needs the user to choose -- a `<gate/>`, a template or style
pick, a disambiguation -- ask with ONE consistent procedure, and NEVER end a
turn on a half-asked question (a bare colon or a trailing "..." with no
options):

1.  Frame it as a short question plus 2-4 options, each a
    `Label — one-line description`.
2.  <if condition="the AskUserQuestion selection-box tool is available to you">
    Call `AskUserQuestion` with that question and those options; read the
    chosen label from the tool result.
    </if>
    <else>
    The host has no selection-box tool (e.g. the **claude.ai web chat**).
    Render the choice as Markdown, then END the turn and wait for the reply:

    <template>
    **<the question>**

    1. **<label>** — <description>
    2. **<label>** — <description>

    _Reply with the number — or your own answer._
    </template>

    Map the reply (a number, a label, or free text) back to an option; free
    text matching none is an "Other" answer to act on.
    </else>
3.  If the user declines or cancels, treat it as Cancel: do not advance; ask
    what they want instead.


Stage Gate
----------

-   `<gate/>`:
    A BLOCKING checkpoint placed at the end of certain steps (the
    decision points). The flow does NOT advance past it until the user
    explicitly approves. Run it like this:

    1.  Emit a **checkpoint**: a short summary of what was resolved/produced
        in this step, with the step's key values shown explicitly.
    2.  Ask, via the **Asking the User** procedure, offering at least
        **Approve & continue** and **Change** (adjust a value / revise and
        gate again).
    3.  On *approve* advance; on *change* stay in this step, apply the change,
        and gate again.

    Never advance past a `<gate/>` by assuming or inferring an unanswered
    value -- an unresolved required value (e.g. the deck language) is asked
    at the gate, not guessed. Steps without a `<gate/>` proceed normally.
