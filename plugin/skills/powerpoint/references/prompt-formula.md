Image Prompt Formula (Nano Banana Pro)
======================================

Every image prompt follows this formula (English, one paragraph):

**[Style] + [Subject with primary accent] + [Scene / text-in-image] +
[Lighting / background constraint] + [Quality] + [Aspect]**

Element rules
-------------

-   **Style**: the deck-wide style block from `style-catalog.md`,
    verbatim. Photos/motifs use the image style; diagrams use the
    info-graphic style.
-   **Subject with primary accent**: the main subject carries ONE
    visible element in the template's primary accent color, named with
    hue and hex code, e.g. `a deep blue (#1F4E79) blazer`.
-   **Scene / text-in-image**: where the scene plausibly carries text
    (screens, banners, whiteboards, signs) -- and ALWAYS on title-role
    images -- embed the slide title or deck topic:
    `text on screen reads "<title>"`. Keep embedded text short
    (2-5 words); the model renders short text reliably. This is the
    ONLY sanctioned use of text vocabulary -- and it excludes the
    `No text` suffix on that prompt.
-   **Lighting / background constraint**: lighting matching the style
    (e.g. `soft diffused natural light`); apply template sidecar
    constraints here (e.g. `dark muted background` for title/closing
    layouts with a white line, when the style is illustration/render).
-   **Overlay regions become negative space**: `tpl inspect`/`describe`
    report per picture placeholder which shapes sit on top and WHERE
    (`overlays`: e.g. `Title (bottom area, left part)`). Translate every
    overlay into Google's documented negative-space pattern:
    `the [bottom-left area] is a vast empty [color] canvas creating
    significant negative space` -- and position the subject in the
    free region (`positioned in the upper right third`).
    CRITICAL: never EXPLAIN the reason. Typographic vocabulary
    ("title", "footer", "caption", "label", "watermark", "text sits
    there") triggers the model's text rendering and produces pseudo
    lettering. Describe only what the IMAGE looks like.
-   **Text suppression**: unless the prompt deliberately embeds text
    (quoted, short), end with the official suffix clause:
    `No text. No letters. No symbols.` Positive phrasing beats
    negation everywhere else ("plain matte surface", not "no clutter").
-   **Quality**: `sharp focus, 8k` plus style-appropriate terms.
-   **Aspect**: state the placeholder's ratio as composition guidance,
    e.g. `2:3 portrait composition`, `16:9 wide composition`,
    `square 1:1 composition`.
-   **Secondary colors**: only for graphic elements within the image
    (dashboards, charts, UI), listed as hex codes from the template's
    `accent2`-`accent6`.

Per-image creative step
-----------------------

Never template the motif. For each picture placeholder, decide
deliberately:

1.  What does THIS slide say (the slide message)?
2.  What is the placeholder's role (title / chapter / content /
    background / contact)?
3.  Which single motif makes the message tangible without repeating
    a motif already used in this deck?

Background-image layouts get calm, low-contrast motifs (text sits on
top). Contact placeholders get neutral business portraits.

Example (title role, 2:3, stock photo, accent1 = #1F4E79)
---------------------------------------------------------

```
commercial photography, shot on Canon EOS R5 85mm f/1.4, professional
business woman in a deep blue (#1F4E79) blazer standing in a modern
glass office lobby, holding a tablet whose screen reads "AI Strategy",
soft diffused natural light from floor-to-ceiling windows, shallow
depth of field, professional color grading, sharp focus, 8k,
2:3 portrait composition
```
