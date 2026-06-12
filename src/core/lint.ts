/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  core/lint: capacity linting of planned text content. Warnings are computed
**  during the plan phase against the same geometry model `tpl describe` uses;
**  --strict escalates them to a hard failure (exit 7).
*/

import type { Frame, Placeholder } from "./model.js"
import type { RichText } from "../schema/payloads.js"
import { estimateUsedLines } from "./describe/capacity.js"

/**  One lint finding, rendered into the envelope's `warnings` array.  */
export interface LintWarning {
    /**  stable warning code  */
    code: "W_TEXT_OVERFLOW" | "W_ELEMENT_OVERLAP"
    /**  slide address the finding refers to  */
    slide: { id: number | null, index: number, title: string | null }
    /**  placeholder idx the finding refers to (overflow)  */
    placeholder?: number
    /**  estimated display lines of the planned content (overflow)  */
    estimatedLines?: number
    /**  estimated line capacity of the box (overflow)  */
    maxLines?: number
    /**  name of the added element (overlap)  */
    element?: string
    /**  name of the covered shape or placeholder (overlap)  */
    covers?: string
    /**  human-readable summary  */
    message: string
}

/**  a geometry obstacle a new element must not cover  */
export interface Obstacle {
    /**  display name of the existing shape/placeholder  */
    name: string
    /**  geometry in inches  */
    frame: Frame
}

/**  intersection area of two frames, 0 when disjoint or heights unknown  */
const intersectionArea = (a: Frame, b: Frame): number => {
    if (a.w === undefined || a.h === undefined || b.w === undefined || b.h === undefined)
        return 0
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
    return w > 0 && h > 0 ? w * h : 0
}

/**
 *  Check a new element's frame against existing text-bearing shapes.
 *  Picture placeholders are NOT obstacles (prompt boxes overlay them by
 *  design); the caller filters them out and exempts prompt boxes.
 *
 *  @param name - display name of the element about to be added
 *  @param frame - the element's geometry in inches
 *  @param obstacles - text-bearing shapes/placeholders on the slide
 *  @param slide - slide address for the report
 *  @returns a warning for the first covered obstacle, otherwise null
 */
export const lintElementOverlap = (
    name: string,
    frame: Frame,
    obstacles: Obstacle[],
    slide: { id: number | null, index: number, title: string | null }
): LintWarning | null => {
    for (const o of obstacles) {
        const area = intersectionArea(frame, o.frame)
        if (area > 0.05) {
            return {
                code: "W_ELEMENT_OVERLAP",
                slide,
                element: name,
                covers: o.name,
                message: `element '${name}' covers '${o.name}' by ~${area.toFixed(1)} in² -- reposition it`
            }
        }
    }
    return null
}

/**
 *  Flatten rich text content into plain paragraph strings.
 *
 *  @param text - plain string or paragraph list
 *  @returns one plain string per paragraph
 */
export const richTextToPlain = (text: RichText): string[] => {
    if (typeof text === "string")
        return text.split("\n")
    return text.map((p) => p.text ?? (p.runs ?? []).map((r) => r.text).join(""))
}

/**
 *  Check planned text content against a placeholder's capacity.
 *
 *  @param text - the content about to be written
 *  @param ph - the target placeholder (with capacity model)
 *  @param slide - slide address for the report
 *  @returns a warning when the estimate exceeds the capacity, otherwise null
 */
export const lintPlaceholderText = (
    text: RichText,
    ph: Placeholder,
    slide: { id: number | null, index: number, title: string | null }
): LintWarning | null => {
    if (ph.capacity === null)
        return null
    const used = estimateUsedLines(richTextToPlain(text), ph.capacity)
    if (used <= ph.capacity.lines)
        return null
    return {
        code: "W_TEXT_OVERFLOW",
        slide,
        placeholder: ph.idx,
        estimatedLines: used,
        maxLines: ph.capacity.lines,
        message: `text needs ~${used} lines but placeholder ${ph.idx} fits ~${ph.capacity.lines}`
    }
}
