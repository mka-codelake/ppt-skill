/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  commands/tpl: the read plane for templates -- list (directory inventory),
**  describe (LLM-facing Markdown), inspect (precise JSON), validate (check
**  the template against pptc's expectations).
*/

import { readdirSync, existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { PptcError } from "../core/errors.js"
import { narrateTemplate } from "../core/describe/narrate.js"
import type { Layout, TemplateInfo } from "../core/model.js"
import { DeckArchive, readTemplateInfo } from "../engine/reader.js"
import { parse } from "../cli/args.js"

/**  load template info plus the optional human-curated sidecar markdown  */
const loadTemplate = async (file: string): Promise<{ info: TemplateInfo, sidecar: string | null }> => {
    const info = await readTemplateInfo(await DeckArchive.open(file))
    const sidecarPath = file.replace(/\.(potx|pptx)$/i, ".md")
    const sidecar = sidecarPath !== file && existsSync(sidecarPath)
        ? readFileSync(sidecarPath, "utf8")
        : null
    return { info, sidecar }
}

/**  narrow the layout list by a `--layout` selector (index or exact name)  */
const filterLayouts = (info: TemplateInfo, selector: string | null): TemplateInfo => {
    if (selector === null)
        return info
    const layouts = /^\d+$/.test(selector)
        ? info.layouts.filter((l) => l.index === Number(selector))
        : info.layouts.filter((l) => l.name === selector)
    if (layouts.length === 0)
        throw new PptcError("E_ADDR_NOTFOUND", `no layout matching '${selector}'`,
            { layouts: info.layouts.map((l) => ({ index: l.index, name: l.name })) })
    return { ...info, layouts }
}

/**
 *  CLI command `pptc tpl list <dir>`.
 *
 *  @param argv - raw arguments after the subcommand
 *  @returns inventory of .potx/.pptx templates with sidecar availability
 */
export const cmdTplList = (argv: string[]): Record<string, unknown> => {
    const args = parse(argv, { "plain": { type: "boolean" } }, ["dir"])
    const dir = args.positionals[0] as string
    if (!existsSync(dir))
        throw new PptcError("E_FILE", `directory not found: '${dir}'`)
    const templates = readdirSync(dir)
        .filter((f) => /\.(potx|pptx)$/i.test(f))
        .sort()
        .map((f) => ({
            file: path.join(dir, f),
            sidecar: existsSync(path.join(dir, f.replace(/\.(potx|pptx)$/i, ".md")))
        }))
    if (args.flag("plain"))
        return { plain: templates.length === 0
            ? `(no templates in ${path.resolve(dir)})`
            : templates.map((t) => `${t.file}${t.sidecar ? "  [+ sidecar]" : ""}`).join("\n") }
    return { result: { dir: path.resolve(dir), templates } }
}

/**
 *  CLI command `pptc tpl describe <template> [--layout SEL] [--format text|json] [--plain]`.
 *
 *  @param argv - raw arguments after the subcommand
 *  @returns Markdown description (text mode), the raw data (json mode),
 *           or a `plain` payload printing raw Markdown without the envelope
 */
export const cmdTplDescribe = async (argv: string[]): Promise<Record<string, unknown>> => {
    const args = parse(argv, {
        "layout": { type: "string" },
        "format": { type: "string" },
        "plain": { type: "boolean" }
    }, ["template"])
    const file = args.positionals[0] as string
    const { info, sidecar } = await loadTemplate(file)
    const filtered = filterLayouts(info, args.str("layout"))
    if (args.flag("plain"))
        return { plain: narrateTemplate(filtered, path.basename(file), sidecar) }
    if ((args.str("format") ?? "text") === "json")
        return { file: path.resolve(file), result: filtered }
    return {
        file: path.resolve(file),
        result: { description: narrateTemplate(filtered, path.basename(file), sidecar) }
    }
}

/**
 *  CLI command `pptc tpl inspect <template> [--layout SEL]`.
 *
 *  @param argv - raw arguments after the subcommand
 *  @returns the precise TemplateInfo JSON
 */
export const cmdTplInspect = async (argv: string[]): Promise<Record<string, unknown>> => {
    const args = parse(argv, { "layout": { type: "string" } }, ["template"])
    const file = args.positionals[0] as string
    const { info } = await loadTemplate(file)
    return { file: path.resolve(file), result: filterLayouts(info, args.str("layout")) }
}

/**  one validation issue of `tpl validate`  */
interface Issue { severity: "warn" | "fail", message: string }

/**  generic template expectations pptc relies on  */
const validate = (info: TemplateInfo, hasNotesMaster: boolean): Issue[] => {
    const issues: Issue[] = []
    if (info.layouts.length === 0)
        issues.push({ severity: "fail", message: "template has no slide layouts" })
    if (!hasNotesMaster)
        issues.push({ severity: "warn", message: "no notes master -- speaker notes will not render" })
    for (const layout of info.layouts) {
        if (layout.placeholders.length === 0)
            issues.push({ severity: "warn", message: `layout ${layout.index} '${layout.name}' has no fillable placeholders` })
        if (!layout.placeholders.some((p) => p.kind === "title"))
            issues.push({ severity: "warn", message: `layout ${layout.index} '${layout.name}' has no title placeholder` })
        const unresolved = layout.placeholders.filter((p) => p.frame === null)
        if (unresolved.length > 0)
            issues.push({ severity: "warn", message: `layout ${layout.index} '${layout.name}': ${unresolved.length} placeholder(s) without resolvable geometry` })
        const names = layout.placeholders.map((p) => p.name)
        if (new Set(names).size !== names.length)
            issues.push({ severity: "fail", message: `layout ${layout.index} '${layout.name}' has duplicate placeholder names -- fills would be ambiguous` })
    }
    return issues
}

/**
 *  CLI command `pptc tpl validate <template>`.
 *
 *  @param argv - raw arguments after the subcommand
 *  @returns validation report; throws E_LINT when any check fails hard
 */
export const cmdTplValidate = async (argv: string[]): Promise<Record<string, unknown>> => {
    const args = parse(argv, { "plain": { type: "boolean" } }, ["template"])
    const file = args.positionals[0] as string
    const archive = await DeckArchive.open(file)
    const info = await readTemplateInfo(archive)
    const hasNotesMaster = Object.keys(archive.zip.files)
        .some((f) => /^ppt\/notesMasters\/notesMaster\d+\.xml$/.test(f))
    const issues = validate(info, hasNotesMaster)
    const failed = issues.some((i) => i.severity === "fail")
    if (failed)
        throw new PptcError("E_LINT", "template validation failed", { issues })
    if (args.flag("plain"))
        return { plain: [
            `${path.resolve(file)}: ${issues.length === 0 ? "ok" : "warn"} (${info.layouts.length} layouts)`,
            ...issues.map((i) => `  ${i.severity}: ${i.message}`)
        ].join("\n") }
    return {
        file: path.resolve(file),
        result: {
            status: issues.length === 0 ? "ok" : "warn",
            layouts: info.layouts.map((l: Layout) => ({ index: l.index, name: l.name })),
            issues
        }
    }
}
