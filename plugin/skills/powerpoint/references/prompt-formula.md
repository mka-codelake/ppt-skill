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
    hue and hex code, e.g. `a crimson red (#A01441) blazer`.
-   **Scene / text-in-image**: where the scene plausibly carries text
    (screens, banners, whiteboards, signs) -- and ALWAYS on title-role
    images -- embed the slide title or deck topic:
    `text on screen reads "<title>"`. Keep embedded text short
    (2-5 words); the model renders short text reliably.
-   **Lighting / background constraint**: lighting matching the style
    (e.g. `soft diffused natural light`); apply template sidecar
    constraints here (e.g. `dark muted background` for title/closing
    layouts with a white line, when the style is illustration/render).
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

Example (title role, 2:3, stock photo, accent1 = #A01441)
---------------------------------------------------------

```
commercial photography, shot on Canon EOS R5 85mm f/1.4, professional
business woman in a crimson red (#A01441) blazer standing in a modern
glass office lobby, holding a tablet whose screen reads "AI Strategy",
soft diffused natural light from floor-to-ceiling windows, shallow
depth of field, professional color grading, sharp focus, 8k,
2:3 portrait composition
```
