/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  core/ops/slide-add: plan a new slide based on a template layout,
**  optionally filling it in the same op.
*/

import { PptcError } from "../errors.js"
import type { SlideAddOp } from "../../schema/ops.js"
import { newPlanEntry, registerRef, type OpHandler, type PlanContext } from "./registry.js"
import { planFill } from "./fill-common.js"

/**  resolve a layout address (index or exact name) against the template  */
const resolveLayout = (ctx: PlanContext, layout: number | string): number => {
    if (ctx.template === null)
        throw new PptcError("E_TEMPLATE",
            "'slide.add' needs a template: pass --template <file.potx>")
    if (typeof layout === "number") {
        if (ctx.template.layouts[layout] === undefined)
            throw new PptcError("E_ADDR_NOTFOUND",
                `layout index ${layout} out of range (0-${ctx.template.layouts.length - 1})`,
                { layouts: ctx.template.layouts.map((l) => ({ index: l.index, name: l.name })) })
        return layout
    }
    const hit = ctx.template.layouts.find((l) => l.name === layout)
    if (hit === undefined)
        throw new PptcError("E_ADDR_NOTFOUND", `no layout named '${layout}'`,
            { layouts: ctx.template.layouts.map((l) => ({ index: l.index, name: l.name })) })
    return hit.index
}

/**  op handler: slide.add  */
export const slideAdd: OpHandler<SlideAddOp> = {
    name: "slide.add",
    plan(ctx, op): void {
        const layoutIndex = resolveLayout(ctx, op.layout)
        const entry = newPlanEntry({ kind: "seed", layoutIndex }, ctx.nextVirtualId--, null, layoutIndex)
        const at = Math.min(op.at ?? ctx.plan.entries.length, ctx.plan.entries.length)
        ctx.plan.entries.splice(at, 0, entry)
        registerRef(ctx, op.ref, entry)
        planFill(ctx, entry, op)
    }
}
