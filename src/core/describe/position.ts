/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  core/describe/position: classify box geometry into human language. Pure
**  functions translating frames into semantic positions ("left half",
**  "top third, full width") for the LLM-facing template description.
*/

import type { Frame } from "../model.js"

/**
 *  Classify the horizontal placement of a box.
 *
 *  @param frame - box geometry in inches
 *  @param slideW - slide width in inches
 *  @returns one of "full width", "left/right half", "left/center/right column"
 */
export const horizontalBand = (frame: Frame, slideW: number): string => {
    const rel = frame.w / slideW
    const centerX = (frame.x + frame.w / 2) / slideW
    if (rel > 0.8)
        return "full width"
    if (rel > 0.42)
        return centerX < 0.5 ? "left half" : "right half"
    if (centerX < 0.37)
        return "left column"
    if (centerX > 0.63)
        return "right column"
    return "center column"
}

/**
 *  Classify the vertical placement of a box.
 *
 *  @param frame - box geometry in inches
 *  @param slideH - slide height in inches
 *  @returns one of "full height", "upper/middle/lower area"
 */
export const verticalBand = (frame: Frame, slideH: number): string => {
    const rel = frame.h / slideH
    const centerY = (frame.y + frame.h / 2) / slideH
    if (rel > 0.8)
        return "full height"
    if (centerY < 0.33)
        return "upper area"
    if (centerY > 0.67)
        return "lower area"
    return "middle area"
}

/**
 *  Combine horizontal and vertical classification with the area share.
 *
 *  @param frame - box geometry in inches
 *  @param slideW - slide width in inches
 *  @param slideH - slide height in inches
 *  @returns description like "left half, middle area (45% of slide)"
 */
export const describePosition = (frame: Frame, slideW: number, slideH: number): string => {
    const area = Math.round(((frame.w * frame.h) / (slideW * slideH)) * 100)
    return `${horizontalBand(frame, slideW)}, ${verticalBand(frame, slideH)} (${area}% of slide)`
}

/**
 *  Express a box's aspect ratio as the nearest common photo/screen ratio.
 *
 *  @param frame - box geometry in inches
 *  @returns ratio label like "16:9", "4:3", "1:1", "9:16"
 */
export const nearestAspect = (frame: Frame): string => {
    if (frame.h === 0)
        return "16:9"
    const ratio = frame.w / frame.h
    const known: [string, number][] = [
        ["1:1", 1], ["4:3", 4 / 3], ["3:4", 3 / 4], ["3:2", 3 / 2], ["2:3", 2 / 3],
        ["16:9", 16 / 9], ["9:16", 9 / 16], ["21:9", 21 / 9], ["2:1", 2], ["1:2", 0.5]
    ]
    let best = known[0] as [string, number]
    for (const k of known)
        if (Math.abs(k[1] - ratio) < Math.abs(best[1] - ratio))
            best = k
    return best[0]
}
