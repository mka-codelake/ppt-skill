Style Catalog
=============

Two styles are chosen ONCE per deck (before any image prompt is
written) and then applied verbatim to every prompt, so all visuals
look like one family. Curated options below; free-text descriptions
are equally valid -- if the user describes a style, use it verbatim.

The "Best for" column is decision guidance for the USER's choice only; it
is NOT part of the prompt, and it is NOT a default you may auto-pick.
Styles are never inferred from topic or tone -- present the menu and wait
for the user's answer (see SKILL.md STEP 3 style gate). Only the prompt
block goes into the image prompt.

Image Style (photos / motifs)
-----------------------------

| Style            | Prompt block                                                                                                                           | Best for / caveat                                                   |
|------------------|----------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------|
| Stock Photo      | `commercial photography, shot on Canon EOS R5 85mm f/1.4, soft diffused light, shallow depth of field, professional color grading, 8k` | versatile business/people shots                                     |
| Editorial        | `editorial photography, shot on Hasselblad 120mm, cinematic color grading, golden hour backlighting, 8k`                               | premium, magazine feel                                              |
| Cinematic        | `cinematic film still, anamorphic lens, shallow depth of field, dramatic directional lighting, color-graded`                           | mood-driven hero and section openers; not for data slides           |
| Minimalist Photo | `minimalist photography, single subject, wide negative space, muted neutral palette, soft natural light, clean background`             | title/divider slides; breathable, brand-neutral                     |
| 3D Render        | `polished 3D render, soft studio lighting, matte materials, octane render quality`                                                     | objects/metaphors with depth                                        |
| Pencil Sketch    | `graphite pencil drawing, fine hatching, delicate line-weight variation, hand-rendered shading, white paper background`                | innovation/"thinking" feel; light backgrounds only                  |
| Watercolor       | `watercolor painting, soft bleeding washes, transparent color layers, visible paper texture, loose brushwork`                          | healthcare, education, sustainability; too soft for finance/legal   |
| Comic            | `graphic novel illustration, bold clean ink outlines, flat cell-shaded color, dynamic composition`                                     | storytelling, personas, journeys; avoid in regulated/formal sectors |
| Duotone          | `duotone photo, two-color gradient wash over photograph, high contrast, single dominant hue overlay`                                   | enforces brand palette across all images; needs strong brand colors |
| Paper Cutout     | `layered paper cutout art, papercraft, dimensional paper layers, soft drop shadows, clean background`                                  | education/consumer/startup; not for serious enterprise              |

Info-Graphic Style (diagrams / data visuals)
--------------------------------------------

| Style             | Prompt block                                                                                                       | Best for / caveat                                                  |
|-------------------|--------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------|
| Flat              | `flat design infographic, solid color fills, clean sans-serif labels, no shadows`                                  | clean, neutral, on-brand                                           |
| Line              | `minimal line-art infographic, thin consistent strokes, outline icons`                                             | light, technical, airy                                             |
| Isometric         | `isometric infographic, 30-degree perspective, consistent depth, soft shadows`                                     | systems, architecture, processes                                   |
| Hand-drawn        | `hand-drawn sketch infographic, marker strokes, whiteboard aesthetic`                                              | workshops, informal ideation                                       |
| Blueprint         | `blueprint technical drawing, white lines on deep blue background, grid overlay, precise geometric forms`          | engineering/product-spec; labels in PPT, not in the image          |
| Low Poly          | `low poly art, triangulated geometric facets, flat shading, gradient fill`                                         | abstract backgrounds/icons; not for dense data                     |
| Corporate Memphis | `corporate Memphis illustration, flat abstract human figures, no faces, simple geometric shapes, friendly palette` | SaaS/HR, people and process; customize palette or it reads generic |
| Dashboard         | `data-visualization dashboard shell, floating cards, modular grid, subtle glassmorphism, minimal labels`           | analytics decks; add real data in PPT                              |

Consistency rules
-----------------

-   The chosen image-style block appears verbatim in EVERY photo/motif
    prompt; the chosen info-graphic block in EVERY diagram prompt.
-   Never mix styles within one deck unless the user explicitly asks.
-   Template sidecar constraints (e.g. dark backgrounds on title and
    closing slides for illustration styles) take precedence over the
    style block where they conflict.
-   Styles whose models render text unreliably (Blueprint, Dashboard)
    carry NO text in the image -- keep labels in PowerPoint placeholders
    and the image area as negative space.
