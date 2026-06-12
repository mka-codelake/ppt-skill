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
        if (ph.capacity !== null && ph.kind !== "picture" && ph.kind !== "title")
            parts.push(`~${ph.capacity.lines} lines of ~${ph.capacity.charsPerLine} chars`)
        if (ph.overlays !== undefined && ph.overlays.length > 0)
            parts.push("overlaid by "
                + ph.overlays.map((o) => `${o.name} (${o.region})`).join(", ")
                + " -- keep these regions calm in images")
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
    if (sidecar !== null) {
        head.push("")
        head.push("## Notes from the template documentation")
        head.push("")
        head.push(sidecar.trim())
    }
    return [head.join("\n"), ...info.layouts.map((l) => narrateLayout(l, info))].join("\n\n")
}
