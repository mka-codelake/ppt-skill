/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  core/ops/elements: plan transformers for the element-level ops --
**  el.add (generate new elements), el.set (retext) and el.rm (remove),
**  plus img.prompts (prompt-box overlays on picture placeholders).
*/

import { PptcError } from "../errors.js"
import type { Op } from "../../schema/ops.js"
import type { ElementSpec } from "../../schema/payloads.js"
import type { OpHandler } from "./registry.js"
import { entryLayout, resolveEntry } from "./fill-common.js"

/**  shape-name prefix of generated prompt boxes (removable via el.rm)  */
export const PROMPT_BOX_PREFIX = "PptcPromptBox"

/**  op handler: el.add  */
export const elAdd: OpHandler<Extract<Op, { op: "el.add" }>> = {
    name: "el.add",
    plan(ctx, op): void {
        const entry = resolveEntry(ctx, op.slide)
        for (const spec of op.elements)
            entry.elements.push({ name: spec.name ?? null, spec })
    }
}

/**  op handler: el.set  */
export const elSet: OpHandler<Extract<Op, { op: "el.set" }>> = {
    name: "el.set",
    plan(ctx, op): void {
        const entry = resolveEntry(ctx, op.slide)
        if (entry.source.kind === "self") {
            const slide = ctx.deck.slides.find((s) => s.part === (entry.source as { part: string }).part)
            if (slide !== undefined && !slide.shapes.some((sh) => sh.name === op.name))
                throw new PptcError("E_ADDR_NOTFOUND",
                    `slide has no element named '${op.name}'`,
                    { available: slide.shapes.map((sh) => sh.name) })
        }
        entry.setTexts.push({ name: op.name, text: op.text })
    }
}

/**  op handler: el.rm  */
export const elRm: OpHandler<Extract<Op, { op: "el.rm" }>> = {
    name: "el.rm",
    plan(ctx, op): void {
        resolveEntry(ctx, op.slide).removeNames.push(op.name)
    }
}

/**  visual style of prompt boxes (light yellow, accent border)  */
const PROMPT_FILL = "FFFBE6"
const PROMPT_BORDER = "A01441"

/**  op handler: img.prompts  */
export const imgPrompts: OpHandler<Extract<Op, { op: "img.prompts" }>> = {
    name: "img.prompts",
    plan(ctx, op): void {
        const entry = resolveEntry(ctx, op.slide)
        const layout = entryLayout(ctx, entry)
        if (layout === null)
            throw new PptcError("E_ADDR_NOTFOUND",
                "cannot place prompt boxes: the slide's layout is unknown")
        const pics = layout.placeholders.filter((p) => p.kind === "picture" && p.frame !== null)
        if (pics.length === 0)
            throw new PptcError("E_ADDR_NOTFOUND",
                `layout '${layout.name}' has no picture placeholders`)
        const promptFor = (idx: number): string | null =>
            typeof op.prompts === "string" ? op.prompts : op.prompts[String(idx)] ?? null
        for (const pic of pics) {
            const text = promptFor(pic.idx)
            if (text === null)
                continue
            const frame = pic.frame as { x: number, y: number, w: number, h: number }
            const spec: ElementSpec = {
                type: "textbox",
                frame: { x: frame.x, y: frame.y, w: Math.max(frame.w * 0.5, 2), h: Math.max(frame.h * 0.4, 0.8) },
                text: [
                    { text: `BILD-PROMPT (idx ${pic.idx})`, bold: true, size: 9, color: PROMPT_BORDER },
                    { text, size: 9, color: "4A4A4A" }
                ],
                fill: PROMPT_FILL,
                border: PROMPT_BORDER,
                borderPt: 1
            }
            entry.elements.push({ name: `${PROMPT_BOX_PREFIX}-${pic.idx}`, spec })
        }
    }
}

/**  op handler: meta.props  */
export const metaProps: OpHandler<Extract<Op, { op: "meta.props" }>> = {
    name: "meta.props",
    plan(ctx, op): void {
        const patch: Record<string, string> = { ...(ctx.plan.props ?? {}) }
        for (const [key, value] of Object.entries(op.set))
            if (value !== undefined)
                patch[key] = value
        ctx.plan.props = patch
    }
}
