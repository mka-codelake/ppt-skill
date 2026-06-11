/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  core/lint: capacity linting of planned text content. Warnings are computed
**  during the plan phase against the same geometry model `tpl describe` uses;
**  --strict escalates them to a hard failure (exit 7).
*/

import type { Placeholder } from "./model.js"
import type { RichText } from "../schema/payloads.js"
import { estimateUsedLines } from "./describe/capacity.js"

/**  One lint finding, rendered into the envelope's `warnings` array.  */
export interface LintWarning {
    /**  stable warning code  */
    code: "W_TEXT_OVERFLOW"
    /**  slide address the finding refers to  */
    slide: { id: number | null, index: number, title: string | null }
    /**  placeholder idx the finding refers to  */
    placeholder: number
    /**  estimated display lines of the planned content  */
    estimatedLines: number
    /**  estimated line capacity of the box  */
    maxLines: number
    /**  human-readable summary  */
    message: string
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
