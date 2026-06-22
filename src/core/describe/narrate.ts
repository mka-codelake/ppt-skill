/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  core/describe/narrate: turn resolved template data into the Markdown text
**  that `tpl describe` emits -- the decision basis an LLM uses to pick the
**  layout that fits its content. Everything here is derived generically from
**  geometry; no template-specific knowledge is allowed.
*/

import type { Layout, TemplateInfo } from "../model.js"
import { describePosition, nearestAspect } from "./position.js"
import { renderMinimap } from "./minimap.js"

/**  coverage at or above which a picture placeholder is a true BACKGROUND
     image (overlay text covers most of it): the prompt then carries no
     text and keeps one even tone so the text on top stays legible  */
const BACKGROUND_COVERAGE = 0.65

/**
 *  Derive a suitability hint for a layout from its placeholder structure.
 *
 *  @param layout - the layout to judge
 *  @returns a short usage hint ("comparison/juxtaposition", ...)
 */
export const suitabilityHint = (layout: Layout): string => {
    const text = layout.placeholders.filter((p) => p.kind === "body")
    const pics = layout.placeholders.filter((p) => p.kind === "picture")
    const bigPic = pics.some((p) => p.frame !== null && p.frame.w * p.frame.h > 20)
    if (text.length === 0 && pics.length === 0)
        return "key message or section break (title/subtitle only)"
    if (text.length === 0 && pics.length > 0)
        return "title, chapter or closing slide with visual impact"
    if (text.length >= 3)
        return `${text.length} parallel text areas -- list of equal-rank aspects`
    if (text.length === 2 && pics.length === 0)
        return "2 text columns -- comparison/juxtaposition"
    if (text.length >= 1 && bigPic)
        return "large picture + text -- infographic with explanation"
    if (text.length === 1 && pics.length === 1)
        return "text and picture side by side -- explained subject"
    if (text.length === 1 && pics.length === 0)
        return "one content area -- prose, bullets, table or chart"
    return "mixed layout -- contents freely combinable"
}

/**
 *  Render one layout section of the description.
 *
 *  @param layout - the layout to render
 *  @param info - template-wide data (slide size, fonts)
 *  @returns Markdown section with inventory, minimap and per-placeholder facts
 */
export const narrateLayout = (layout: Layout, info: TemplateInfo): string => {
    const { w, h } = info.slideSize
    const lines: string[] = []
    lines.push(`## Layout ${layout.index}: "${layout.name}"`)
    lines.push("")
    lines.push(`Suitability: ${suitabilityHint(layout)}`)
    lines.push("")
    lines.push("```")
    lines.push(renderMinimap(layout, w, h))
    lines.push("```")
    lines.push("")
    for (const ph of layout.placeholders) {
        const addr = `\`${ph.idx}\``
        const kind =
            ph.kind === "title" ? "Title" :
            ph.kind === "subtitle" ? "Subtitle" :
            ph.kind === "picture" ? "Picture" : "Text area"
        const parts: string[] = [`- ${kind} (idx ${addr}, "${ph.name}")`]
        if (ph.frame !== null) {
            parts.push(describePosition(ph.frame, w, h))
            if (ph.kind === "picture")
                parts.push(`aspect ratio ~${nearestAspect(ph.frame)}`)
        }
        if (ph.capacity !== null && ph.kind !== "picture")
            parts.push(`~${ph.capacity.lines} lines of ~${ph.capacity.charsPerLine} chars`)
        if (ph.overlays !== undefined && ph.overlays.length > 0)
            parts.push("overlaid by "
                + ph.overlays.map((o) => `${o.name} (${o.region})`).join(", ")
                + " -- keep these regions calm in images")
        if (ph.coverage !== undefined)
            parts.push(ph.coverage >= BACKGROUND_COVERAGE
                ? `~${Math.round(ph.coverage * 100)}% text-covered -- background image: carry NO text and keep one even tone (light text on a dark image, dark text on a light image)`
                : `~${Math.round(ph.coverage * 100)}% text-covered`)
        lines.push(parts.join(" — "))
    }
    return lines.join("\n")
}

/**
 *  Render the full `tpl describe` Markdown document.
 *
 *  @param info - resolved template data
 *  @param source - template file path (shown in the header)
 *  @param sidecar - optional human-curated notes from a `<template>.md` sidecar
 *  @returns complete Markdown description of all layouts
 */
export const narrateTemplate = (info: TemplateInfo, source: string, sidecar: string | null): string => {
    const head: string[] = []
    head.push(`# Template: ${source}`)
    head.push("")
    head.push(`Slide size: ${info.slideSize.w}" x ${info.slideSize.h}" -- fonts: ${info.fonts.major} (headings), ${info.fonts.minor} (body)`)
    const accents = ["accent1", "accent2", "accent3"]
        .map((k) => info.colors[k])
        .filter((c): c is string => c !== undefined)
    if (accents.length > 0)
        head.push(`Accent colors: ${accents.map((c) => `#${c}`).join(", ")}`)
    head.push("")
    head.push(`Layouts: ${info.layouts.length} -- addressable in \`slide.add\` by index or name.`)
    head.push("Placeholders are filled in `slide.fill` via their `idx` number.")
    if (info.contentArea !== undefined) {
        const c = info.contentArea
        head.push(`Content area (guide-aligned): x ${c.x}" y ${c.y}" w ${c.w.toFixed(2)}" h ${c.h.toFixed(2)}"`
            + " -- place `el.add` tables/textboxes/diagrams inside this box on title-only layouts.")
    }
    if (info.guides !== undefined)
        head.push(`Guides (in): horizontal [${info.guides.horizontal.join(", ")}], vertical [${info.guides.vertical.join(", ")}].`)
    if (sidecar !== null) {
        head.push("")
        head.push("## Notes from the template documentation")
        head.push("")
        head.push(sidecar.trim())
    }
    return [head.join("\n"), ...info.layouts.map((l) => narrateLayout(l, info))].join("\n\n")
}
