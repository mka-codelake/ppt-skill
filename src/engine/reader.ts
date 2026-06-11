/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  engine/reader: read-only OOXML access. Opens .pptx/.potx archives and
**  extracts the domain read models: TemplateInfo (layouts, theme, capacity)
**  and DeckState (slides, shapes, rev token). This module never writes.
*/

import JSZip from "jszip"
import { readFileSync } from "node:fs"
import path from "node:path"
import type { Document, Element } from "@xmldom/xmldom"
import { PptcError } from "../core/errors.js"
import { contentHash, requireFile } from "../infra/fs.js"
import { estimateCapacity } from "../core/describe/capacity.js"
import { elements, firstElement, drawingText, parseXml } from "./xml.js"
import { emuToInch } from "../core/model.js"
import type {
    DeckState, Frame, Layout, Placeholder, PlaceholderKind,
    ShapeInfo, SlideInfo, TemplateInfo
} from "../core/model.js"

/**  An opened OOXML archive with cached XML parsing.  */
export class DeckArchive {
    private readonly cache = new Map<string, Document>()

    private constructor(
        /**  underlying zip archive  */
        readonly zip: JSZip,
        /**  absolute source file path  */
        readonly file: string
    ) {}

    /**
     *  Open a .pptx or .potx file.
     *
     *  @param file - path of the archive
     *  @returns the opened archive
     *  @throws PptcError E_FILE when missing or not a zip
     */
    static async open(file: string): Promise<DeckArchive> {
        requireFile(file, "presentation file")
        try {
            const zip = await JSZip.loadAsync(readFileSync(file))
            return new DeckArchive(zip, path.resolve(file))
        }
        catch {
            throw new PptcError("E_FILE", `'${file}' is not a readable pptx/potx archive`)
        }
    }

    /**
     *  Raw string content of an archive part.
     *
     *  @param part - part path inside the archive
     *  @returns content, or null when the part does not exist
     */
    async text(part: string): Promise<string | null> {
        const f = this.zip.file(part)
        return f === null ? null : await f.async("string")
    }

    /**
     *  Parsed XML of an archive part (cached).
     *
     *  @param part - part path inside the archive
     *  @returns DOM document
     *  @throws PptcError E_TEMPLATE when the part is missing
     */
    async xml(part: string): Promise<Document> {
        const cached = this.cache.get(part)
        if (cached !== undefined)
            return cached
        const text = await this.text(part)
        if (text === null)
            throw new PptcError("E_TEMPLATE", `archive part missing: ${part}`)
        const doc = parseXml(text)
        this.cache.set(part, doc)
        return doc
    }
}

/**  normalize an OOXML placeholder `type` attribute to a PlaceholderKind  */
const phKind = (type: string | null): PlaceholderKind => {
    switch (type) {
        case "title":
        case "ctrTitle": return "title"
        case "subTitle": return "subtitle"
        case "pic": return "picture"
        case "ftr": return "footer"
        case "sldNum": return "slideNumber"
        case "dt": return "date"
        case null:
        case "body": return "body"
        default: return "other"
    }
}

/**  extract the frame of a shape from its `a:xfrm`, null when inherited  */
const shapeFrame = (sp: Element): Frame | null => {
    const xfrm = firstElement(sp, "a:xfrm")
    if (xfrm === null)
        return null
    const off = firstElement(xfrm, "a:off")
    const ext = firstElement(xfrm, "a:ext")
    if (off === null || ext === null)
        return null
    return {
        x: emuToInch(Number(off.getAttribute("x"))),
        y: emuToInch(Number(off.getAttribute("y"))),
        w: emuToInch(Number(ext.getAttribute("cx"))),
        h: emuToInch(Number(ext.getAttribute("cy")))
    }
}

/**  read `p:ph` facts of a shape, null when the shape is no placeholder  */
const phFacts = (sp: Element): { idx: number, kind: PlaceholderKind } | null => {
    const ph = firstElement(sp, "p:ph")
    if (ph === null)
        return null
    return {
        idx: Number(ph.getAttribute("idx") ?? "0"),
        kind: phKind(ph.getAttribute("type"))
    }
}

/**  resolve the layout part paths of all masters, in master order  */
const layoutPartsInOrder = async (archive: DeckArchive): Promise<string[]> => {
    const presRels = await archive.xml("ppt/_rels/presentation.xml.rels")
    const pres = await archive.xml("ppt/presentation.xml")
    const relTarget = (rels: Document, rid: string): string | null => {
        for (const rel of elements(rels, "Relationship"))
            if (rel.getAttribute("Id") === rid)
                return rel.getAttribute("Target")
        return null
    }
    const parts: string[] = []
    for (const masterId of elements(pres, "p:sldMasterId")) {
        const target = relTarget(presRels, masterId.getAttribute("r:id") ?? "")
        if (target === null)
            continue
        const masterPart = path.posix.join("ppt", target)
        const master = await archive.xml(masterPart)
        const masterRels = await archive.xml(
            path.posix.join(path.posix.dirname(masterPart), "_rels", `${path.posix.basename(masterPart)}.rels`))
        for (const layoutId of elements(master, "p:sldLayoutId")) {
            const lt = relTarget(masterRels, layoutId.getAttribute("r:id") ?? "")
            if (lt !== null)
                parts.push(path.posix.normalize(path.posix.join("ppt/slideMasters", lt)))
        }
    }
    return parts
}

/**  read default font sizes (pt) for title and body from the master text styles  */
const masterFontSizes = async (archive: DeckArchive): Promise<{ title: number, body: number }> => {
    const fallback = { title: 36, body: 18 }
    try {
        const master = await archive.xml("ppt/slideMasters/slideMaster1.xml")
        const styleSize = (styleTag: string): number | null => {
            const style = firstElement(master, styleTag)
            if (style === null)
                return null
            const lvl1 = firstElement(style, "a:lvl1pPr")
            const rPr = lvl1 === null ? null : firstElement(lvl1, "a:defRPr")
            const sz = rPr?.getAttribute("sz")
            return sz == null ? null : Number(sz) / 100
        }
        return {
            title: styleSize("p:titleStyle") ?? fallback.title,
            body: styleSize("p:bodyStyle") ?? fallback.body
        }
    }
    catch {
        return fallback
    }
}

/**
 *  Read template-wide data: slide size, theme, and all layouts with resolved
 *  placeholder geometry and capacity. Works on .potx and .pptx alike.
 *
 *  @param archive - opened archive
 *  @returns the resolved template info
 */
export const readTemplateInfo = async (archive: DeckArchive): Promise<TemplateInfo> => {
    const pres = await archive.xml("ppt/presentation.xml")
    const sldSz = firstElement(pres, "p:sldSz")
    const slideSize = {
        w: emuToInch(Number(sldSz?.getAttribute("cx") ?? "12192000")),
        h: emuToInch(Number(sldSz?.getAttribute("cy") ?? "6858000"))
    }

    /*  theme fonts and colors (first theme part)  */
    const themePart = Object.keys(archive.zip.files)
        .find((f) => /^ppt\/theme\/theme\d+\.xml$/.test(f)) ?? "ppt/theme/theme1.xml"
    const theme = await archive.xml(themePart)
    const fontOf = (tag: string): string =>
        firstElement(firstElement(theme, tag) ?? theme, "a:latin")?.getAttribute("typeface") ?? "Calibri"
    const colors: Record<string, string> = {}
    const scheme = firstElement(theme, "a:clrScheme")
    if (scheme !== null && scheme.childNodes !== null)
        for (let i = 0; i < scheme.childNodes.length; i++) {
            const node = scheme.childNodes.item(i) as Element
            if (node.nodeType !== 1)
                continue
            const name = node.nodeName.replace("a:", "")
            const val = firstElement(node, "a:srgbClr")?.getAttribute("val")
                ?? firstElement(node, "a:sysClr")?.getAttribute("lastClr")
            if (val !== null && val !== undefined)
                colors[name] = val.toUpperCase()
        }

    /*  layouts with placeholders; geometry inherited from master when absent  */
    const sizes = await masterFontSizes(archive)
    const layouts: Layout[] = []
    const parts = await layoutPartsInOrder(archive)
    for (let index = 0; index < parts.length; index++) {
        const doc = await archive.xml(parts[index] as string)
        const name = firstElement(doc, "p:cSld")?.getAttribute("name") ?? `Layout ${index}`
        const placeholders: Placeholder[] = []
        for (const sp of elements(doc, "p:sp")) {
            const ph = phFacts(sp)
            if (ph === null || ph.kind === "footer" || ph.kind === "slideNumber" || ph.kind === "date")
                continue
            const frame = shapeFrame(sp)
            const fontSize = ph.kind === "title" ? sizes.title : sizes.body
            placeholders.push({
                idx: ph.idx,
                kind: ph.kind,
                name: firstElement(sp, "p:cNvPr")?.getAttribute("name") ?? `Placeholder ${ph.idx}`,
                frame,
                capacity: frame !== null && ph.kind !== "picture"
                    ? estimateCapacity(frame, fontSize)
                    : null
            })
        }
        layouts.push({ index, name, placeholders })
    }
    return { slideSize, fonts: { major: fontOf("a:majorFont"), minor: fontOf("a:minorFont") }, colors, layouts }
}

/**  classify a non-placeholder shape element  */
const shapeType = (el: Element): ShapeInfo["type"] => {
    switch (el.nodeName) {
        case "p:pic": return "picture"
        case "p:cxnSp": return "connector"
        case "p:grpSp": return "group"
        case "p:graphicFrame": {
            const uri = firstElement(el, "a:graphicData")?.getAttribute("uri") ?? ""
            return uri.endsWith("/table") ? "table" : uri.endsWith("/chart") ? "chart" : "other"
        }
        default: return "other"
    }
}

/**  extract table cell texts from a graphicFrame  */
const tableCells = (frame: Element): string[][] =>
    elements(frame, "a:tr").map((tr) => elements(tr, "a:tc").map((tc) => drawingText(tc)))

/**
 *  Read the full deck state: slides, shapes, notes and the rev token.
 *
 *  @param archive - opened archive of a .pptx deck
 *  @returns the deck read model (the agent's source of truth)
 */
export const readDeckState = async (archive: DeckArchive): Promise<DeckState> => {
    const info = await readTemplateInfo(archive)
    const layoutIndexByName = new Map(info.layouts.map((l) => [l.name, l.index]))
    const pres = await archive.xml("ppt/presentation.xml")
    const presRels = await archive.xml("ppt/_rels/presentation.xml.rels")
    const relMap = new Map(elements(presRels, "Relationship")
        .map((r) => [r.getAttribute("Id") ?? "", r.getAttribute("Target") ?? ""]))

    const slides: SlideInfo[] = []
    const hashParts: string[] = []
    const sldIds = elements(pres, "p:sldId")
    for (let index = 0; index < sldIds.length; index++) {
        const sldId = sldIds[index] as Element
        const id = Number(sldId.getAttribute("id"))
        const target = relMap.get(sldId.getAttribute("r:id") ?? "") ?? ""
        const part = path.posix.normalize(path.posix.join("ppt", target))
        const partBase = path.posix.basename(part)
        const slideXmlText = await archive.text(part) ?? ""
        hashParts.push(`${id}:${slideXmlText}`)
        const doc = parseXml(slideXmlText)

        /*  layout of this slide  */
        const slideRels = await archive.xml(`ppt/slides/_rels/${partBase}.rels`)
        const layoutTarget = elements(slideRels, "Relationship")
            .find((r) => (r.getAttribute("Type") ?? "").endsWith("/slideLayout"))?.getAttribute("Target")
        let layoutName = ""
        let layoutIndex = -1
        if (layoutTarget !== null && layoutTarget !== undefined) {
            const layoutPart = path.posix.normalize(path.posix.join("ppt/slides", layoutTarget))
            const layoutDoc = await archive.xml(layoutPart)
            layoutName = firstElement(layoutDoc, "p:cSld")?.getAttribute("name") ?? ""
            layoutIndex = layoutIndexByName.get(layoutName) ?? -1
        }

        /*  shapes  */
        const shapes: ShapeInfo[] = []
        let title: string | null = null
        const spTree = firstElement(doc, "p:spTree")
        if (spTree !== null && spTree.childNodes !== null)
            for (let i = 0; i < spTree.childNodes.length; i++) {
                const node = spTree.childNodes.item(i) as Element
                if (node.nodeType !== 1)
                    continue
                if (!["p:sp", "p:pic", "p:graphicFrame", "p:cxnSp", "p:grpSp"].includes(node.nodeName))
                    continue
                const cNvPr = firstElement(node, "p:cNvPr")
                const ph = node.nodeName === "p:sp" || node.nodeName === "p:pic" ? phFacts(node) : null
                const txBody = node.nodeName === "p:sp" ? firstElement(node, "p:txBody") : null
                const text = txBody === null ? null : drawingText(txBody) || null
                if (ph !== null && (ph.kind === "title" || ph.idx === 0))
                    title = text
                const shape: ShapeInfo = {
                    name: cNvPr?.getAttribute("name") ?? "",
                    id: Number(cNvPr?.getAttribute("id") ?? "0"),
                    type: node.nodeName === "p:sp"
                        ? (ph !== null ? "placeholder" : (firstElement(node, "a:prstGeom") !== null ? "shape" : "textbox"))
                        : shapeType(node),
                    placeholderIdx: ph?.idx ?? null,
                    placeholderKind: ph?.kind ?? null,
                    frame: shapeFrame(node),
                    text
                }
                if (shape.type === "table")
                    shape.table = tableCells(node)
                shapes.push(shape)
            }

        /*  speaker notes  */
        const notesTarget = elements(slideRels, "Relationship")
            .find((r) => (r.getAttribute("Type") ?? "").endsWith("/notesSlide"))?.getAttribute("Target")
        let notes: string | null = null
        if (notesTarget !== null && notesTarget !== undefined) {
            const notesPart = path.posix.normalize(path.posix.join("ppt/slides", notesTarget))
            const notesText = await archive.text(notesPart)
            if (notesText !== null) {
                const notesDoc = parseXml(notesText)
                const body = elements(notesDoc, "p:sp")
                    .find((sp) => phFacts(sp)?.kind === "body")
                notes = body === undefined ? null : (drawingText(body) || null)
            }
        }
        slides.push({ id, index, title, layoutName, layoutIndex, shapes, notes, part })
    }

    return {
        file: archive.file,
        rev: contentHash(...hashParts, JSON.stringify(slides.map((s) => s.id))),
        slideSize: info.slideSize,
        slides
    }
}
