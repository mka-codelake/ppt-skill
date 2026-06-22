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
 *  Classify where an overlapping box sits WITHIN an outer box -- tells an
 *  image prompt which regions of a picture must stay calm because text
 *  sits on top ("top area", "bottom area, left part", ...).
 *
 *  @param outer - the picture frame
 *  @param inner - the overlapping shape's frame
 *  @returns region label relative to the outer box, null when disjoint
 */
export const regionWithin = (outer: Frame, inner: Frame): string | null => {
    const x = Math.max(inner.x, outer.x)
    const y = Math.max(inner.y, outer.y)
    const r = Math.min(inner.x + inner.w, outer.x + outer.w)
    const b = Math.min(inner.y + inner.h, outer.y + outer.h)
    if (r <= x || b <= y)
        return null
    const relW = (r - x) / outer.w
    const relH = (b - y) / outer.h
    const cx = ((x + r) / 2 - outer.x) / outer.w
    const cy = ((y + b) / 2 - outer.y) / outer.h
    const hBand = relW > 0.8 ? "full width"
        : cx < 0.37 ? "left part" : cx > 0.63 ? "right part" : "center"
    const vBand = relH > 0.8 ? "full height"
        : cy < 0.37 ? "top area" : cy > 0.63 ? "bottom area" : "middle area"
    if (hBand === "full width" && vBand === "full height")
        return "entire image"
    if (hBand === "full width")
        return vBand
    if (vBand === "full height")
        return hBand
    return `${vBand}, ${hBand}`
}

/**
 *  Fraction (0..1) of an outer box covered by inner boxes -- their UNION,
 *  clipped to the outer box, so overlapping inners are not double-counted.
 *  Tells a partly-overlaid picture (negative space, subject moves aside)
 *  from a true background image (text covers most of it).
 *
 *  @param outer - the picture frame
 *  @param inners - overlapping shape frames
 *  @returns covered fraction in [0, 1], 0 when the outer area is zero
 */
export const coverageFraction = (outer: Frame, inners: Frame[]): number => {
    const area = outer.w * outer.h
    if (area <= 0)
        return 0
    /*  clip each inner to the outer box, drop the ones that fall outside  */
    const rects: Frame[] = []
    for (const f of inners) {
        const x = Math.max(f.x, outer.x)
        const y = Math.max(f.y, outer.y)
        const r = Math.min(f.x + f.w, outer.x + outer.w)
        const b = Math.min(f.y + f.h, outer.y + outer.h)
        if (r > x && b > y)
            rects.push({ x, y, w: r - x, h: b - y })
    }
    if (rects.length === 0)
        return 0
    /*  union area via coordinate compression: cut the outer box into vertical
        strips at every distinct x edge, then for each strip merge the
        y-intervals of the rects that span it and sum their length  */
    const xs = Array.from(new Set(rects.flatMap((f) => [f.x, f.x + f.w]))).sort((a, b) => a - b)
    let covered = 0
    for (let i = 0; i + 1 < xs.length; i++) {
        const x0 = xs[i] as number
        const x1 = xs[i + 1] as number
        const stripW = x1 - x0
        if (stripW <= 0)
            continue
        const ivals = rects
            .filter((f) => f.x <= x0 && f.x + f.w >= x1)
            .map((f): [number, number] => [f.y, f.y + f.h])
            .sort((a, b) => a[0] - b[0])
        let yCov = 0
        let openS = Infinity
        let openE = -Infinity
        for (const [s, e] of ivals) {
            if (s > openE) {
                if (openE > openS)
                    yCov += openE - openS
                openS = s
                openE = e
            }
            else if (e > openE)
                openE = e
        }
        if (openE > openS)
            yCov += openE - openS
        covered += stripW * yCov
    }
    return Math.min(1, covered / area)
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
