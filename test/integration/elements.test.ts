/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  Integration: element-level ops and the write-path features that the
**  basic roundtrip does not cover -- el.set/el.rm (incl. same-run
**  cancellation and UUID-suffix matching), prompt boxes, backgrounds,
**  hyperlinks, placeholder images, slide.copy isolation and --out.
*/

import { beforeAll, describe, expect, it } from "vitest"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import JSZip from "jszip"
import { buildEmptyDeck } from "../../src/engine/seed.js"
import { DeckArchive, readDeckState } from "../../src/engine/reader.js"
import { expectIntact } from "../util/integrity.js"
import { executeOps, type ExecuteOptions } from "../../src/commands/apply.js"
import { PptcError } from "../../src/core/errors.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE = path.join(here, "..", "fixtures", "neutral-template.pptx")
const TMP = path.join(here, "..", "tmp")
const DECK = path.join(TMP, "elements.pptx")
const PNG = path.join(TMP, "pixel.png")

const opts: ExecuteOptions = { templatePath: TEMPLATE, dryRun: false, strict: false, expectRev: null, outFile: null }

/**  smallest valid 1x1 PNG  */
const PIXEL = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64")

/**  read a slide part (by presentation order) from the deck zip  */
const slideXml = async (file: string, index: number): Promise<string> => {
    const zip = await JSZip.loadAsync(readFileSync(file))
    const pres = await (zip.file("ppt/presentation.xml") as JSZip.JSZipObject).async("string")
    const rels = await (zip.file("ppt/_rels/presentation.xml.rels") as JSZip.JSZipObject).async("string")
    const rids = [...pres.matchAll(/<p:sldId[^>]*r:id="([^"]+)"/g)].map((m) => m[1])
    const relMap = new Map([...rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]))
    return await (zip.file(`ppt/${relMap.get(rids[index] as string) as string}`) as JSZip.JSZipObject).async("string")
}

beforeAll(async () => {
    mkdirSync(TMP, { recursive: true })
    writeFileSync(PNG, PIXEL)
    writeFileSync(DECK, await buildEmptyDeck(TEMPLATE))
    await executeOps(DECK, {
        ops: [
            { op: "slide.add", layout: "CONTENT", placeholders: { title: { text: "Basis" } } }
        ]
    }, opts)
})

describe("element ops", () => {
    it("cancels a same-run generated element via el.rm", async () => {
        await executeOps(DECK, {
            ops: [
                { op: "el.add", slide: "title:Basis", elements: [
                    { type: "textbox", frame: { x: 1, y: 5, w: 4, h: 0.5 }, text: "wegwerf", name: "Throwaway" }
                ] },
                { op: "el.rm", slide: "title:Basis", name: "Throwaway" }
            ]
        }, opts)
        expect(await slideXml(DECK, 0)).not.toContain("Throwaway")
    })

    it("removes existing elements by base name despite UUID suffixes", async () => {
        await executeOps(DECK, {
            ops: [{ op: "el.add", slide: "title:Basis", elements: [
                { type: "textbox", frame: { x: 1, y: 5, w: 4, h: 0.5 }, text: "bleibt erstmal", name: "Kasten" }
            ] }]
        }, opts)
        expect(await slideXml(DECK, 0)).toContain("Kasten")
        await executeOps(DECK, { ops: [{ op: "el.rm", slide: "title:Basis", name: "Kasten" }] }, opts)
        expect(await slideXml(DECK, 0)).not.toContain("Kasten")
    })

    it("fails cleanly when el.rm addresses nothing", async () => {
        await expect(executeOps(DECK,
            { ops: [{ op: "el.rm", slide: "title:Basis", name: "GibtsNicht" }] }, opts))
            .rejects.toSatisfy((err: unknown) => (err as PptcError).code === "E_ADDR_NOTFOUND")
    })

    it("patches a same-run generated textbox via el.set", async () => {
        await executeOps(DECK, {
            ops: [
                { op: "el.add", slide: "title:Basis", elements: [
                    { type: "textbox", frame: { x: 1, y: 5.6, w: 4, h: 0.5 }, text: "alt", name: "SetBox" }
                ] },
                { op: "el.set", slide: "title:Basis", name: "SetBox", text: "neu gesetzt" }
            ]
        }, opts)
        const xml = await slideXml(DECK, 0)
        expect(xml).toContain("neu gesetzt")
        expect(xml).not.toContain(">alt<")
    })

    it("adds and removes prompt boxes on picture-less layouts with a clean error", async () => {
        await expect(executeOps(DECK,
            { ops: [{ op: "img.prompts", slide: "title:Basis", prompts: "x" }] }, opts))
            .rejects.toSatisfy((err: unknown) => (err as PptcError).code === "E_ADDR_NOTFOUND")
    })
})

describe("write-path features", () => {
    it("sets a solid background and wires hyperlinks externally", async () => {
        await executeOps(DECK, {
            ops: [
                { op: "slide.fill", slide: "title:Basis", background: { color: "#1A1A2E" } },
                { op: "el.add", slide: "title:Basis", elements: [
                    { type: "textbox", frame: { x: 1, y: 6.2, w: 5, h: 0.4 }, name: "Link",
                        text: [{ runs: [{ text: "mehr", hyperlink: "https://example.org/mehr" }] }] }
                ] }
            ]
        }, opts)
        const xml = await slideXml(DECK, 0)
        expect(xml).toContain("1A1A2E")
        expect(xml).not.toContain("pptc-hlink")
        const zip = await JSZip.loadAsync(readFileSync(DECK))
        const relsParts = Object.keys(zip.files).filter((f) => /slides\/_rels\/.*\.rels$/.test(f))
        let external = false
        for (const part of relsParts) {
            const rels = await (zip.file(part) as JSZip.JSZipObject).async("string")
            if (rels.includes("example.org/mehr") && rels.includes("TargetMode=\"External\""))
                external = true
        }
        expect(external).toBe(true)
    })

    it("fills picture placeholders with image media", async () => {
        await executeOps(DECK, {
            ops: [{ op: "slide.add", layout: "TITLE_SLIDE",
                placeholders: { title: { text: "Bildfolie" } } }]
        }, opts)
        /*  the fixture has no picture placeholder; expect the clean error  */
        await expect(executeOps(DECK, {
            ops: [{ op: "slide.fill", slide: "title:Bildfolie",
                placeholders: { image: { image: PNG } } }]
        }, opts)).rejects.toSatisfy((err: unknown) => (err as PptcError).code === "E_ADDR_NOTFOUND")
    })

    it("keeps copies isolated: el.set on the copy must not patch the original", async () => {
        await executeOps(DECK, {
            ops: [
                { op: "slide.add", ref: "orig", layout: "CONTENT",
                    placeholders: { title: { text: "Original" } } },
                { op: "el.add", slide: "$orig", elements: [
                    { type: "textbox", frame: { x: 1, y: 5, w: 4, h: 0.5 }, text: "geteilt?", name: "Iso" }
                ] },
                { op: "slide.copy", slide: "$orig", ref: "klon" },
                { op: "el.set", slide: "$klon", name: "Iso", text: "nur im Klon" }
            ]
        }, opts)
        const state = await readDeckState(await DeckArchive.open(DECK))
        const orig = state.slides.find((s) => s.title === "Original" && state.slides.indexOf(s) ===
            state.slides.findIndex((x) => x.title === "Original")) ?? state.slides[0]
        const klon = state.slides.filter((s) => s.title === "Original")[1]
        const textOf = (slide: typeof orig, name: string): string | null =>
            slide?.shapes.find((sh) => sh.name.startsWith(name))?.text ?? null
        expect(textOf(orig, "Iso")).toBe("geteilt?")
        expect(textOf(klon, "Iso")).toBe("nur im Klon")
    })

    it("writes to --out and leaves the source untouched", async () => {
        const before = readFileSync(DECK)
        const variant = path.join(TMP, "variant-out.pptx")
        await executeOps(DECK,
            { ops: [{ op: "meta.props", set: { subject: "Variante" } }] },
            { ...opts, outFile: variant })
        expect(readFileSync(DECK).equals(before)).toBe(true)
        const zip = await JSZip.loadAsync(readFileSync(variant))
        const core = await (zip.file("docProps/core.xml") as JSZip.JSZipObject).async("string")
        expect(core).toContain("Variante")
    })

    it("written decks pass the file-integrity validation", async () => {
        await expectIntact(DECK)
        await expectIntact(path.join(TMP, "variant-out.pptx"))
    })
})
