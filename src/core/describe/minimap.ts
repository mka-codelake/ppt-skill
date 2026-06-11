/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  core/describe/minimap: render the placeholder arrangement of a layout as
**  a small ASCII map, so an LLM (or a human in a terminal) sees the visual
**  structure of a layout at a glance.
*/

import type { Layout, Placeholder } from "../model.js"

/**  width of the rendered map in characters (slide aspect is preserved)  */
const MAP_W = 40
/**  height of the rendered map in characters  */
const MAP_H = 13

/**  short tag a placeholder is labeled with on the map  */
const tag = (ph: Placeholder): string => {
    const prefix =
        ph.kind === "title" ? "T" :
        ph.kind === "subtitle" ? "S" :
        ph.kind === "picture" ? "IMG" : "TXT"
    return `${prefix}:${ph.idx}`
}

/**
 *  Render an ASCII minimap of a layout's placeholder arrangement.
 *
 *  @param layout - the layout to render
 *  @param slideW - slide width in inches
 *  @param slideH - slide height in inches
 *  @returns multi-line ASCII drawing, boxes labeled with kind and idx
 */
export const renderMinimap = (layout: Layout, slideW: number, slideH: number): string => {
    /*  paint background  */
    const grid: string[][] = Array.from({ length: MAP_H }, (_, r) =>
        Array.from({ length: MAP_W }, (_, c) =>
            r === 0 || r === MAP_H - 1 ? "-" : c === 0 || c === MAP_W - 1 ? "|" : " "))
    const set = (r: number, c: number, ch: string): void => {
        if (r >= 0 && r < MAP_H && c >= 0 && c < MAP_W)
            (grid[r] as string[])[c] = ch
    }

    /*  paint each placeholder box (inner area excludes the slide border)  */
    for (const ph of layout.placeholders) {
        if (ph.frame === null)
            continue
        const c1 = 1 + Math.round((ph.frame.x / slideW) * (MAP_W - 2))
        const r1 = 1 + Math.round((ph.frame.y / slideH) * (MAP_H - 2))
        const c2 = Math.min(MAP_W - 2, 1 + Math.round(((ph.frame.x + ph.frame.w) / slideW) * (MAP_W - 2)) - 1)
        const r2 = Math.min(MAP_H - 2, 1 + Math.round(((ph.frame.y + ph.frame.h) / slideH) * (MAP_H - 2)) - 1)
        for (let c = c1; c <= c2; c++) {
            set(r1, c, ".")
            set(r2, c, ".")
        }
        for (let r = r1; r <= r2; r++) {
            set(r, c1, ".")
            set(r, c2, ".")
        }
        /*  place the label inside the box, clipped to the box width  */
        const label = tag(ph).slice(0, Math.max(1, c2 - c1))
        for (let i = 0; i < label.length; i++)
            set(r1 + 1 <= r2 ? r1 + 1 : r1, c1 + 1 + i, label.charAt(i))
    }
    return grid.map((row) => row.join("")).join("\n")
}
