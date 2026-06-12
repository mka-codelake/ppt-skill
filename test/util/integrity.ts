/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  test/util/integrity: static deck validation against every known
**  PowerPoint "repair" trigger. Every test that writes a deck runs this --
**  a structurally fine but repair-prompting file is a failed test.
*/

import JSZip from "jszip"
import path from "node:path"
import { readFileSync } from "node:fs"
import { DOMParser } from "@xmldom/xmldom"

/**
 *  Validate a written deck for the known PowerPoint repair triggers.
 *
 *  @param file - path of the .pptx to check
 *  @returns list of human-readable findings; empty when the deck is clean
 */
export const integrityFindings = async (file: string): Promise<string[]> => {
    const findings: string[] = []
    const zip = await JSZip.loadAsync(readFileSync(file))
    const names = new Set(Object.keys(zip.files).filter((n) => !n.endsWith("/")))
    const text = async (part: string): Promise<string> =>
        await (zip.file(part) as JSZip.JSZipObject).async("string")

    /*  1. every XML part must be well-formed  */
    for (const n of names)
        if (n.endsWith(".xml") || n.endsWith(".rels"))
            try {
                const parser = new DOMParser({
                    onError: (_level, msg): void => { throw new Error(msg) }
                })
                parser.parseFromString(await text(n), "application/xml")
            }
            catch (err) {
                findings.push(`${n}: malformed XML (${String(err).slice(0, 80)})`)
            }

    /*  2. cNvPr shape ids must be unique per slide  */
    for (const n of names)
        if (/^ppt\/slides\/slide\d+\.xml$/.test(n)) {
            const ids = [...(await text(n)).matchAll(/<p:cNvPr id="(\d+)"/g)].map((m) => m[1])
            const dup = [...new Set(ids.filter((id) => ids.indexOf(id) !== ids.lastIndexOf(id)))]
            if (dup.length > 0)
                findings.push(`${n}: duplicate cNvPr ids ${dup.join(",")}`)
        }

    /*  3. every internal relationship target must exist  */
    for (const n of names)
        if (n.endsWith(".rels")) {
            const base = path.posix.dirname(path.posix.dirname(n))
            for (const m of (await text(n)).matchAll(/<Relationship [^>]*?\/>/g)) {
                if (m[0].includes("TargetMode=\"External\""))
                    continue
                const target = /Target="([^"]+)"/.exec(m[0])?.[1] ?? ""
                const full = path.posix.normalize(path.posix.join(base, target))
                if (!names.has(full))
                    findings.push(`${n}: dead relationship target ${target}`)
            }
        }

    /*  4. content-type overrides: no dead parts, no duplicates  */
    const ct = await text("[Content_Types].xml")
    const overrides = [...ct.matchAll(/<Override PartName="([^"]+)"/g)].map((m) => m[1] as string)
    for (const o of new Set(overrides)) {
        if (!names.has(o.replace(/^\//, "")))
            findings.push(`[Content_Types].xml: override for missing part ${o}`)
        if (overrides.filter((x) => x === o).length > 1)
            findings.push(`[Content_Types].xml: duplicate override ${o}`)
    }

    /*  5. every part must be covered by a default or override  */
    const defaults = new Set([...ct.matchAll(/<Default Extension="([^"]+)"/g)].map((m) => (m[1] as string).toLowerCase()))
    const overridden = new Set(overrides.map((o) => o.replace(/^\//, "")))
    for (const n of names)
        if (n !== "[Content_Types].xml" && !overridden.has(n)
            && !defaults.has(n.split(".").pop()?.toLowerCase() ?? ""))
            findings.push(`${n}: no content type (neither default nor override)`)

    /*  6. every sldId in the presentation must resolve to a slide part  */
    const pres = await text("ppt/presentation.xml")
    const rels = await text("ppt/_rels/presentation.xml.rels")
    const relMap = new Map([...rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)]
        .map((m) => [m[1] as string, m[2] as string]))
    for (const m of pres.matchAll(/<p:sldId [^>]*r:id="([^"]+)"/g)) {
        const target = relMap.get(m[1] as string)
        if (target === undefined || !names.has(path.posix.normalize(path.posix.join("ppt", target))))
            findings.push(`presentation.xml: sldId ${m[1]} does not resolve to a slide part`)
    }

    return findings
}

/**
 *  Assert helper: throws with all findings when the deck is not clean.
 *
 *  @param file - path of the .pptx to check
 */
export const expectIntact = async (file: string): Promise<void> => {
    const findings = await integrityFindings(file)
    if (findings.length > 0)
        throw new Error(`deck integrity violated:\n  ${findings.join("\n  ")}`)
}
