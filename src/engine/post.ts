/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  engine/post: the zip-level post-pass that runs after pptx-automizer has
**  written the slide structure. It garbage-collects unreferenced slide parts
**  and applies everything automizer cannot express: speaker notes, footer
**  cloning, backgrounds, images inside picture placeholders, hyperlink
**  relationships and document properties.
*/

import JSZip from "jszip"
import { readFileSync } from "node:fs"
import path from "node:path"
import type { Document, Element } from "@xmldom/xmldom"
import { PptcError } from "../core/errors.js"
import { inchToEmu, type Frame } from "../core/model.js"
import { HLINK_ATTR } from "./text.js"
import { NS_A, NS_P, NS_R, NS_REL, elements, firstElement, parseXml, serializeXml } from "./xml.js"

/**  per-output-slide work items, in final slide order  */
export interface PostSlideWork {
    /**  speaker notes text to set, null = leave untouched  */
    notes: string | null
    /**  footer text to clone in from the layout, null = leave untouched  */
    footer: string | null
    /**  solid background color (RRGGBB), null = leave untouched  */
    background: string | null
    /**  images to insert into picture placeholders  */
    images: { phIdx: number, path: string, frame?: Frame }[]
}

/**  mutable archive context shared by the post steps  */
interface Post {
    zip: JSZip
    rid: number
}

/**  read an archive part as string (must exist)  */
const partText = async (zip: JSZip, part: string): Promise<string> => {
    const f = zip.file(part)
    if (f === null)
        throw new PptcError("E_ENGINE", `output archive is missing part ${part}`)
    return await f.async("string")
}

/**  slide part paths referenced from the presentation, in sldIdLst order  */
const referencedSlides = async (zip: JSZip): Promise<string[]> => {
    const pres = parseXml(await partText(zip, "ppt/presentation.xml"))
    const rels = parseXml(await partText(zip, "ppt/_rels/presentation.xml.rels"))
    const relMap = new Map(elements(rels, "Relationship")
        .map((r) => [r.getAttribute("Id") ?? "", r.getAttribute("Target") ?? ""]))
    return elements(pres, "p:sldId").map((s) =>
        path.posix.normalize(path.posix.join("ppt", relMap.get(s.getAttribute("r:id") ?? "") ?? "")))
}

/**  remove a list of parts plus their rels and content-type overrides  */
const removeParts = async (zip: JSZip, parts: string[]): Promise<void> => {
    if (parts.length === 0)
        return
    let ct = await partText(zip, "[Content_Types].xml")
    for (const part of parts) {
        zip.remove(part)
        zip.remove(`${path.posix.dirname(part)}/_rels/${path.posix.basename(part)}.rels`)
        ct = ct.replace(new RegExp(`<Override PartName="/${part.replace(/[.\\/]/g, "\\$&")}"[^>]*/>`, "g"), "")
    }
    zip.file("[Content_Types].xml", ct)
}

/**  garbage-collect slide and notes parts no longer referenced  */
const gcParts = async (zip: JSZip, kept: string[]): Promise<void> => {
    const keptSet = new Set(kept)
    const orphanSlides = Object.keys(zip.files)
        .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f) && !keptSet.has(f))
    await removeParts(zip, orphanSlides)
    /*  notes slides referenced from kept slides survive; their slide
        back-reference must follow the (possibly renamed) parent part  */
    const referencedNotes = new Set<string>()
    for (const slide of kept) {
        const relsPart = `ppt/slides/_rels/${path.posix.basename(slide)}.rels`
        const relsText = await zip.file(relsPart)?.async("string")
        if (relsText === undefined)
            continue
        for (const rel of elements(parseXml(relsText), "Relationship"))
            if ((rel.getAttribute("Type") ?? "").endsWith("/notesSlide")) {
                const notesPart = path.posix.normalize(
                    path.posix.join("ppt/slides", rel.getAttribute("Target") ?? ""))
                referencedNotes.add(notesPart)
                const noteRelsPart = `ppt/notesSlides/_rels/${path.posix.basename(notesPart)}.rels`
                const noteRelsText = await zip.file(noteRelsPart)?.async("string")
                if (noteRelsText === undefined)
                    continue
                const noteRels = parseXml(noteRelsText)
                for (const back of elements(noteRels, "Relationship"))
                    if ((back.getAttribute("Type") ?? "").endsWith("/slide"))
                        back.setAttribute("Target", `../slides/${path.posix.basename(slide)}`)
                zip.file(noteRelsPart, serializeXml(noteRels))
            }
    }
    const orphanNotes = Object.keys(zip.files)
        .filter((f) => /^ppt\/notesSlides\/notesSlide[^/]*\.xml$/.test(f) && !referencedNotes.has(f))
    await removeParts(zip, orphanNotes)
    /*  drop presentation relationships whose target part vanished
        (stale slide rels from a previous apply trigger a repair)  */
    const presRelsPart = "ppt/_rels/presentation.xml.rels"
    const presRels = parseXml(await partText(zip, presRelsPart))
    let pruned = false
    for (const rel of elements(presRels, "Relationship")) {
        if (rel.getAttribute("TargetMode") === "External")
            continue
        const target = path.posix.normalize(path.posix.join("ppt", rel.getAttribute("Target") ?? ""))
        if (zip.file(target) === null) {
            rel.parentNode?.removeChild(rel)
            pruned = true
        }
    }
    if (pruned)
        zip.file(presRelsPart, serializeXml(presRels))
}

/**  drop content-type overrides that are duplicates or whose part vanished  */
export const cleanContentTypes = async (zip: JSZip): Promise<void> => {
    const ct = parseXml(await partText(zip, "[Content_Types].xml"))
    const seen = new Set<string>()
    let changed = false
    for (const o of elements(ct, "Override")) {
        const part = (o.getAttribute("PartName") ?? "").replace(/^\//, "")
        if (zip.file(part) === null || seen.has(part)) {
            o.parentNode?.removeChild(o)
            changed = true
        }
        else
            seen.add(part)
    }
    if (changed)
        zip.file("[Content_Types].xml", serializeXml(ct))
}

/**  drop section slide references whose sldId vanished (user-created
     sections survive edits; stale refs would point at removed slides)  */
const pruneSectionRefs = async (zip: JSZip): Promise<void> => {
    const part = "ppt/presentation.xml"
    const xml = await partText(zip, part)
    if (!xml.includes("<p14:sectionLst"))
        return
    const ids = new Set([...xml.matchAll(/<p:sldId [^>]*\bid="(\d+)"/g)].map((m) => m[1] as string))
    const out = xml.replace(/<p14:sldId id="(\d+)"[^>]*\/>/g,
        (m, id: string) => ids.has(id) ? m : "")
    if (out !== xml)
        zip.file(part, out)
}

/**  rel types that are never referenced from the slide XML itself  */
const STRUCTURAL_RELS = ["/slideLayout", "/notesSlide"]

/**  drop slide relationships whose id no longer occurs in the slide XML
     (automizer accumulates one stale chart/image rel per re-import)  */
const pruneUnusedSlideRels = (slide: Document, slideRels: Document): boolean => {
    const xml = serializeXml(slide)
    let changed = false
    for (const rel of elements(slideRels, "Relationship")) {
        const type = rel.getAttribute("Type") ?? ""
        if (STRUCTURAL_RELS.some((k) => type.endsWith(k)))
            continue
        if (!xml.includes(`"${rel.getAttribute("Id") ?? ""}"`)) {
            rel.parentNode?.removeChild(rel)
            changed = true
        }
    }
    return changed
}

/**  GC charts, embeddings and media unreachable from any live part --
     automizer re-imports duplicate chart parts on every apply, so without
     this the archive doubles its charts per round  */
const gcAssets = async (zip: JSZip): Promise<void> => {
    const isAsset = (f: string): boolean =>
        /^ppt\/(charts|embeddings|media)\//.test(f) && !f.endsWith("/") && !f.includes("/_rels/")
    const assets = Object.keys(zip.files).filter(isAsset)
    if (assets.length === 0)
        return
    const live = new Set<string>()
    const queue = Object.keys(zip.files).filter((f) =>
        f.endsWith(".rels") && !/^ppt\/(charts|embeddings|media)\//.test(f))
    while (queue.length > 0) {
        const relsPart = queue.pop() as string
        const relsText = await zip.file(relsPart)?.async("string")
        if (relsText === undefined)
            continue
        const base = path.posix.dirname(path.posix.dirname(relsPart))
        for (const rel of elements(parseXml(relsText), "Relationship")) {
            if (rel.getAttribute("TargetMode") === "External")
                continue
            const target = path.posix.normalize(path.posix.join(base, rel.getAttribute("Target") ?? ""))
            if (isAsset(target) && !live.has(target)) {
                live.add(target)
                const tRels = `${path.posix.dirname(target)}/_rels/${path.posix.basename(target)}.rels`
                if (zip.file(tRels) !== null)
                    queue.push(tRels)
            }
        }
    }
    await removeParts(zip, assets.filter((a) => !live.has(a)))
}

/**  make cNvPr shape ids unique within a slide (duplicates trigger repair)  */
const uniquifyShapeIds = (slide: Document): boolean => {
    const all = elements(slide, "p:cNvPr")
    let max = 0
    for (const el of all)
        max = Math.max(max, Number(el.getAttribute("id") ?? "0"))
    const seen = new Set<number>()
    let changed = false
    for (const el of all) {
        const id = Number(el.getAttribute("id") ?? "0")
        if (seen.has(id)) {
            el.setAttribute("id", String(++max))
            changed = true
        }
        else
            seen.add(id)
    }
    return changed
}

/**  next unique pptc relationship id within a rels document  */
const nextRid = (post: Post): string => `rIdPptc${post.rid++}`

/**  append a relationship to a rels document  */
const addRel = (rels: Document, id: string, type: string, target: string, external = false): void => {
    const rel = rels.createElementNS(NS_REL, "Relationship")
    rel.setAttribute("Id", id)
    rel.setAttribute("Type", type)
    rel.setAttribute("Target", target)
    if (external)
        rel.setAttribute("TargetMode", "External")
    rels.documentElement?.appendChild(rel)
}

/**  set a solid background color on a slide  */
const setBackground = (slide: Document, color: string): void => {
    const cSld = firstElement(slide, "p:cSld")
    if (cSld === null)
        return
    const old = firstElement(slide, "p:bg")
    if (old !== null)
        cSld.removeChild(old)
    const bg = slide.createElementNS(NS_P, "p:bg")
    const bgPr = slide.createElementNS(NS_P, "p:bgPr")
    const fill = slide.createElementNS(NS_A, "a:solidFill")
    const clr = slide.createElementNS(NS_A, "a:srgbClr")
    clr.setAttribute("val", color)
    fill.appendChild(clr)
    bgPr.appendChild(fill)
    bgPr.appendChild(slide.createElementNS(NS_A, "a:effectLst"))
    bg.appendChild(bgPr)
    cSld.insertBefore(bg, cSld.firstChild)
}

/**  clone the footer placeholder from the slide's layout and set its text  */
const setFooter = async (zip: JSZip, slidePart: string, slide: Document, text: string): Promise<void> => {
    /*  drop an existing footer shape first  */
    const spTree = firstElement(slide, "p:spTree")
    if (spTree === null)
        return
    for (const sp of elements(slide, "p:sp")) {
        const ph = firstElement(sp, "p:ph")
        if (ph !== null && ph.getAttribute("type") === "ftr")
            spTree.removeChild(sp)
    }
    /*  locate the layout and its footer placeholder  */
    const relsText = await partText(zip, `ppt/slides/_rels/${path.posix.basename(slidePart)}.rels`)
    const layoutTarget = elements(parseXml(relsText), "Relationship")
        .find((r) => (r.getAttribute("Type") ?? "").endsWith("/slideLayout"))?.getAttribute("Target")
    if (layoutTarget === undefined || layoutTarget === null)
        return
    const layoutPart = path.posix.normalize(path.posix.join("ppt/slides", layoutTarget))
    const layout = parseXml(await partText(zip, layoutPart))
    const ftr = elements(layout, "p:sp").find((sp) =>
        firstElement(sp, "p:ph")?.getAttribute("type") === "ftr")
    if (ftr === undefined)
        return
    const clone = slide.importNode(ftr, true) as Element
    /*  unique shape id and the footer text  */
    const ids = elements(slide, "p:cNvPr").map((c) => Number(c.getAttribute("id") ?? "0"))
    firstElement(clone, "p:cNvPr")?.setAttribute("id", String(Math.max(0, ...ids) + 1))
    const txBody = firstElement(clone, "p:txBody")
    if (txBody !== null) {
        for (const p of elements(txBody, "a:p"))
            txBody.removeChild(p)
        const p = slide.createElementNS(NS_A, "a:p")
        const r = slide.createElementNS(NS_A, "a:r")
        const t = slide.createElementNS(NS_A, "a:t")
        t.appendChild(slide.createTextNode(text))
        r.appendChild(t)
        p.appendChild(r)
        txBody.appendChild(p)
    }
    spTree.appendChild(clone)
}

/**  content-type defaults for image media  */
const IMAGE_TYPES: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", svg: "image/svg+xml", webp: "image/webp"
}

/**  ensure a `<Default Extension=...>` entry exists for an image extension  */
const ensureImageDefault = async (zip: JSZip, ext: string): Promise<void> => {
    const ct = await partText(zip, "[Content_Types].xml")
    if (ct.includes(`Extension="${ext}"`))
        return
    zip.file("[Content_Types].xml",
        ct.replace("<Default", `<Default Extension="${ext}" ContentType="${IMAGE_TYPES[ext] ?? "image/png"}"/><Default`))
}

/**  replace an empty picture placeholder with an actual picture shape  */
const fillPicturePlaceholder = (
    slide: Document, rid: string, phIdx: number, frame: Frame | undefined
): boolean => {
    const sp = elements(slide, "p:sp").find((s) => {
        const ph = firstElement(s, "p:ph")
        return ph !== null && ph.getAttribute("type") === "pic"
            && Number(ph.getAttribute("idx") ?? "0") === phIdx
    })
    if (sp === undefined)
        return false
    const cNvPr = firstElement(sp, "p:cNvPr")
    const name = cNvPr?.getAttribute("name") ?? `Picture ${phIdx}`
    const id = cNvPr?.getAttribute("id") ?? "99"
    const ph = firstElement(sp, "p:ph") as Element
    const xfrm = frame === undefined ? firstElement(sp, "a:xfrm") : null

    const pic = slide.createElementNS(NS_P, "p:pic")
    const nvPicPr = slide.createElementNS(NS_P, "p:nvPicPr")
    const newCNvPr = slide.createElementNS(NS_P, "p:cNvPr")
    newCNvPr.setAttribute("id", id)
    newCNvPr.setAttribute("name", name)
    const cNvPicPr = slide.createElementNS(NS_P, "p:cNvPicPr")
    const picLocks = slide.createElementNS(NS_A, "a:picLocks")
    picLocks.setAttribute("noChangeAspect", "1")
    cNvPicPr.appendChild(picLocks)
    const nvPr = slide.createElementNS(NS_P, "p:nvPr")
    nvPr.appendChild(slide.importNode(ph, true))
    nvPicPr.appendChild(newCNvPr)
    nvPicPr.appendChild(cNvPicPr)
    nvPicPr.appendChild(nvPr)
    pic.appendChild(nvPicPr)

    const blipFill = slide.createElementNS(NS_P, "p:blipFill")
    const blip = slide.createElementNS(NS_A, "a:blip")
    blip.setAttributeNS(NS_R, "r:embed", rid)
    const stretch = slide.createElementNS(NS_A, "a:stretch")
    stretch.appendChild(slide.createElementNS(NS_A, "a:fillRect"))
    blipFill.appendChild(blip)
    blipFill.appendChild(stretch)
    pic.appendChild(blipFill)

    const spPr = slide.createElementNS(NS_P, "p:spPr")
    if (frame !== undefined) {
        const xf = slide.createElementNS(NS_A, "a:xfrm")
        const off = slide.createElementNS(NS_A, "a:off")
        off.setAttribute("x", String(inchToEmu(frame.x)))
        off.setAttribute("y", String(inchToEmu(frame.y)))
        const ext = slide.createElementNS(NS_A, "a:ext")
        ext.setAttribute("cx", String(inchToEmu(frame.w)))
        ext.setAttribute("cy", String(inchToEmu(frame.h)))
        xf.appendChild(off)
        xf.appendChild(ext)
        spPr.appendChild(xf)
    }
    else if (xfrm !== null)
        spPr.appendChild(slide.importNode(xfrm, true))
    pic.appendChild(spPr)

    sp.parentNode?.replaceChild(pic, sp)
    return true
}

/**  write speaker notes: create or replace the slide's notesSlide part  */
const setNotes = async (post: Post, slidePart: string, slideRels: Document, text: string): Promise<void> => {
    const base = path.posix.basename(slidePart, ".xml")
    const notesPart = `ppt/notesSlides/notesSlide-pptc-${base}.xml`
    const escaped = text.split("\n").map((line) =>
        `<a:p><a:r><a:t>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</a:t></a:r></a:p>`).join("")
    post.zip.file(notesPart,
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n"
        + "<p:notes xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\""
        + " xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\""
        + " xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\">"
        + "<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>"
        + "<p:grpSpPr/>"
        + "<p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Notes Placeholder\"/>"
        + "<p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr>"
        + "<p:nvPr><p:ph type=\"body\" idx=\"1\"/></p:nvPr></p:nvSpPr>"
        + `<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${escaped}</p:txBody></p:sp>`
        + "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>")
    post.zip.file(`ppt/notesSlides/_rels/${path.posix.basename(notesPart)}.rels`,
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n"
        + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
        + "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster\" Target=\"../notesMasters/notesMaster1.xml\"/>"
        + `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/${path.posix.basename(slidePart)}"/>`
        + "</Relationships>")
    const ct = await partText(post.zip, "[Content_Types].xml")
    if (!ct.includes(notesPart))
        post.zip.file("[Content_Types].xml", ct.replace("</Types>",
            `<Override PartName="/${notesPart}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/></Types>`))
    /*  drop an existing notes rel, then point the slide at the new part  */
    for (const rel of elements(slideRels, "Relationship"))
        if ((rel.getAttribute("Type") ?? "").endsWith("/notesSlide"))
            rel.parentNode?.removeChild(rel)
    addRel(slideRels, nextRid(post),
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide",
        `../notesSlides/${path.posix.basename(notesPart)}`)
}

/**  wire hyperlink marker attributes to real external relationships  */
const wireHyperlinks = (post: Post, slide: Document, slideRels: Document): void => {
    for (const hlink of elements(slide, "a:hlinkClick")) {
        const url = hlink.getAttribute(HLINK_ATTR)
        if (url === null)
            continue
        const rid = nextRid(post)
        addRel(slideRels, rid,
            "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", url, true)
        hlink.removeAttribute(HLINK_ATTR)
        hlink.setAttributeNS(NS_R, "r:id", rid)
    }
}

/**  update document core properties  */
const setProps = async (zip: JSZip, props: Record<string, string>): Promise<void> => {
    const part = "docProps/core.xml"
    const text = await zip.file(part)?.async("string")
    if (text === undefined)
        return
    const doc = parseXml(text)
    const tags: Record<string, [string, string]> = {
        title: ["dc:title", "http://purl.org/dc/elements/1.1/"],
        author: ["dc:creator", "http://purl.org/dc/elements/1.1/"],
        subject: ["dc:subject", "http://purl.org/dc/elements/1.1/"],
        keywords: ["cp:keywords", "http://schemas.openxmlformats.org/package/2006/metadata/core-properties"],
        category: ["cp:category", "http://schemas.openxmlformats.org/package/2006/metadata/core-properties"],
        comments: ["dc:description", "http://purl.org/dc/elements/1.1/"]
    }
    for (const [key, value] of Object.entries(props)) {
        const spec = tags[key]
        if (spec === undefined)
            continue
        let el = firstElement(doc, spec[0])
        if (el === null) {
            el = doc.createElementNS(spec[1], spec[0])
            doc.documentElement?.appendChild(el)
        }
        while (el.firstChild !== null)
            el.removeChild(el.firstChild)
        el.appendChild(doc.createTextNode(value))
    }
    zip.file(part, serializeXml(doc))
}

/**
 *  Run the complete post-pass over automizer's output.
 *
 *  @param bytes - the .pptx produced by the automizer pass
 *  @param work - per-slide work items in final slide order
 *  @param props - document property patch, null for none
 *  @returns the final .pptx bytes
 */
export const postProcess = async (
    bytes: Buffer,
    work: PostSlideWork[],
    props: Record<string, string> | null
): Promise<Buffer> => {
    const zip = await JSZip.loadAsync(bytes)
    const post: Post = { zip, rid: 9001 }
    const slides = await referencedSlides(zip)
    await gcParts(zip, slides)

    let mediaSeq = 1
    for (let i = 0; i < slides.length; i++) {
        const slidePart = slides[i] as string
        const job = work[i]
        const relsPart = `ppt/slides/_rels/${path.posix.basename(slidePart)}.rels`
        const slide = parseXml(await partText(zip, slidePart))
        const slideRels = parseXml(await partText(zip, relsPart))

        if (job !== undefined) {
            if (job.background !== null)
                setBackground(slide, job.background)
            if (job.footer !== null)
                await setFooter(zip, slidePart, slide, job.footer)
            for (const img of job.images) {
                const ext = path.extname(img.path).slice(1).toLowerCase() || "png"
                const mediaPart = `ppt/media/pptcImage${mediaSeq++}.${ext}`
                zip.file(mediaPart, readFileSync(img.path))
                await ensureImageDefault(zip, ext)
                const rid = nextRid(post)
                addRel(slideRels, rid,
                    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
                    `../media/${path.posix.basename(mediaPart)}`)
                if (!fillPicturePlaceholder(slide, rid, img.phIdx, img.frame))
                    throw new PptcError("E_ADDR_NOTFOUND",
                        `slide ${i}: no empty picture placeholder idx ${img.phIdx}`)
            }
            if (job.notes !== null)
                await setNotes(post, slidePart, slideRels, job.notes)
            wireHyperlinks(post, slide, slideRels)
        }
        const idsChanged = uniquifyShapeIds(slide)
        const relsChanged = pruneUnusedSlideRels(slide, slideRels)

        if (job !== undefined || idsChanged || relsChanged) {
            zip.file(slidePart, serializeXml(slide))
            zip.file(relsPart, serializeXml(slideRels))
        }
    }
    if (props !== null)
        await setProps(zip, props)
    /*  final sweeps: orphan assets, stale section refs and stale or
        duplicate content-type overrides accumulate across applies  */
    await gcAssets(zip)
    await pruneSectionRefs(zip)
    await cleanContentTypes(zip)
    return await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
}
