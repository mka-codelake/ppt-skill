/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  core/describe/capacity: estimate how much text fits a placeholder box.
**  The estimate is deliberately simple (average glyph width, fixed line
**  spacing) -- it exists to warn about gross overflow, not to typeset.
*/

import type { Frame, TextCapacity } from "../model.js"

/**  line spacing factor used by PowerPoint's default paragraph style  */
const LINE_SPACING = 1.2
/**  average glyph width relative to the font size for Latin body text  */
const AVG_GLYPH_WIDTH = 0.5
/**  inner text inset of a placeholder box in inches (left+right, top+bottom)  */
const BOX_INSET_IN = 0.2

/**
 *  Estimate the text capacity of a box for a given font size.
 *
 *  @param frame - box geometry in inches
 *  @param fontSizePt - font size in points the box content will use
 *  @returns estimated line and per-line character capacity
 */
export const estimateCapacity = (frame: Frame, fontSizePt: number): TextCapacity => {
    const innerW = Math.max(frame.w - BOX_INSET_IN, 0.1)
    const innerH = Math.max(frame.h - BOX_INSET_IN, 0.1)
    const lineHeightIn = (fontSizePt * LINE_SPACING) / 72
    const glyphWidthIn = (fontSizePt * AVG_GLYPH_WIDTH) / 72
    return {
        lines: Math.max(1, Math.floor(innerH / lineHeightIn)),
        charsPerLine: Math.max(1, Math.floor(innerW / glyphWidthIn)),
        fontSizePt
    }
}

/**
 *  Estimate how many display lines a text occupies inside a capacity model,
 *  accounting for wrapping of long paragraphs.
 *
 *  @param paragraphs - plain text content, one entry per paragraph
 *  @param capacity - capacity model of the target box
 *  @returns estimated number of display lines after wrapping
 */
export const estimateUsedLines = (paragraphs: readonly string[], capacity: TextCapacity): number => {
    let lines = 0
    for (const p of paragraphs)
        lines += Math.max(1, Math.ceil(p.length / capacity.charsPerLine))
    return lines
}
