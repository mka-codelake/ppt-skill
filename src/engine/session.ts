/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  engine/session: execute a finished MutationPlan. One automizer pass
**  rebuilds the slide structure (kept slides re-imported, new slides pulled
**  from the template's seed deck, callbacks apply text and generated
**  elements), one post-pass applies the zip-level work, then the result is
**  written atomically. A failing session never touches the target file.
*/

import automizerPkg from "pptx-automizer"
import { readFileSync, rmSync } from "node:fs"
import path from "node:path"
import type { Element } from "@xmldom/xmldom"
import { PptcError, toPptcError } from "../core/errors.js"
import type { MutationPlan, SlidePlanEntry } from "../core/ops/registry.js"
import { atomicWrite, cacheDir } from "../infra/fs.js"
import { addElement, type GenRoot, type GenSlide } from "./elements.js"
import { postProcess, type PostSlideWork } from "./post.js"
import { ensureSeed } from "./seed.js"
import { setShapeText } from "./text.js"

/*  unwrap the CJS default export robustly: plain node and vite/vitest
    disagree on how many .default levels the interop introduces  */
const unwrapDefault = (mod: unknown): new (params: Record<string, unknown>) => InstanceType<typeof automizerPkg.default> => {
    let candidate: unknown = mod
    while (typeof candidate !== "function" && candidate !== null && typeof candidate === "object"
        && "default" in (candidate as Record<string, unknown>))
        candidate = (candidate as Record<string, unknown>)["default"]
    return candidate as new (params: Record<string, unknown>) => InstanceType<typeof automizerPkg.default>
}
const Automizer = unwrapDefault(automizerPkg)

/**  result facts of an executed session  */
export interface SessionResult {
    /**  number of output slides  */
    slideCount: number
    /**  plan-order positions of the entries that carried a ref  */
    refIndexes: Record<string, number>
}

/**  automizer's slide number = numeric part of the slide part filename  */
const partNumber = (part: string): number =>
    Number(/slide(\d+)\.xml$/.exec(part)?.[1] ?? "0")

/**
 *  Run a function with console output diverted to stderr. pptx-automizer
 *  logs diagnostics via console.log; stdout belongs exclusively to the
 *  envelope, so anything the engine prints must land on stderr.
 *
 *  @param fn - the function to run shielded
 *  @returns the function's result
 */
const withStdoutShield = async <T>(fn: () => Promise<T>): Promise<T> => {
    const original = { log: console.log, info: console.info, warn: console.warn }
    console.log = (...args: unknown[]): void => { console.error(...args) }
    console.info = (...args: unknown[]): void => { console.error(...args) }
    console.warn = (...args: unknown[]): void => { console.error(...args) }
    try {
        return await fn()
    }
    finally {
        console.log = original.log
        console.info = original.info
        console.warn = original.warn
    }
}

/**  compose the automizer callback for one planned slide  */
const slideCallback = (entry: SlidePlanEntry) =>
    (slide: {
        modifyElement(name: string, cb: ((el: unknown) => void)[]): void
        removeElement(name: string): void
        generate(cb: (pSlide: GenSlide, gen: GenRoot) => void, name?: string): void
    }): void => {
        for (const fill of entry.fills)
            if (fill.text !== undefined) {
                const text = fill.text
                slide.modifyElement(fill.phName, [
                    (el): void => setShapeText(el as Element, text, fill.append)
                ])
            }
        for (const setText of entry.setTexts)
            slide.modifyElement(setText.name, [
                (el): void => setShapeText(el as Element, setText.text)
            ])
        for (const name of entry.removeNames)
            slide.removeElement(name)
        for (const planned of entry.elements)
            slide.generate(
                (pSlide, gen): void => addElement(pSlide, gen, planned.spec),
                planned.name ?? undefined)
    }

/**  the two engine passes: automizer rebuild plus zip-level post work  */
const executePlan = async (
    deckFile: string,
    outFile: string,
    plan: MutationPlan,
    seedPath: string | null,
    tmpName: string,
    tmpFile: string
): Promise<SessionResult> => {
    const automizer = new Automizer({
        templateDir: "",
        outputDir: cacheDir(),
        removeExistingSlides: true,
        verbosity: 0
    })
    let pres = automizer
        .loadRoot(path.resolve(deckFile))
        .load(path.resolve(deckFile), "self")
    if (seedPath !== null)
        pres = pres.load(seedPath, "seed")
    for (const entry of plan.entries) {
        const sourceNumber = entry.source.kind === "self"
            ? partNumber(entry.source.part)
            : entry.source.layoutIndex + 1
        pres.addSlide(entry.source.kind, sourceNumber, slideCallback(entry))
    }
    await pres.write(tmpName)

    const work: PostSlideWork[] = plan.entries.map((entry) => ({
        notes: entry.notes,
        footer: entry.footer,
        background: entry.background,
        images: entry.fills
            .filter((f) => f.image !== undefined)
            .map((f) => ({
                phIdx: f.phIdx,
                path: f.image as string,
                ...(f.frame !== undefined && { frame: f.frame })
            }))
    }))
    const finalBytes = await postProcess(readFileSync(tmpFile), work, plan.props)
    atomicWrite(path.resolve(outFile), finalBytes)

    const refIndexes: Record<string, number> = {}
    for (const [name, entry] of plan.refs)
        refIndexes[name] = plan.entries.indexOf(entry)
    return { slideCount: plan.entries.length, refIndexes }
}

/**
 *  Execute a mutation plan against a deck file.
 *
 *  @param deckFile - the deck to read from (root of the rebuild)
 *  @param outFile - the file to write atomically (may equal deckFile)
 *  @param plan - the finished mutation plan
 *  @param templatePath - template for seed slides, null when none needed
 *  @returns session facts for the result envelope
 *  @throws PptcError E_TEMPLATE when seed slides are planned without a
 *          template, E_ENGINE on automizer failures (target untouched)
 */
export const runSession = async (
    deckFile: string,
    outFile: string,
    plan: MutationPlan,
    templatePath: string | null
): Promise<SessionResult> => {
    const needsSeed = plan.entries.some((e) => e.source.kind === "seed")
    if (needsSeed && templatePath === null)
        throw new PptcError("E_TEMPLATE",
            "the ops document creates slides: pass --template <file.potx>")
    const seedPath = needsSeed ? await ensureSeed(templatePath as string) : null

    const tmpName = `pptc-session-${process.pid}.pptx`
    const tmpFile = path.join(cacheDir(), tmpName)
    try {
        return await withStdoutShield(() =>
            executePlan(deckFile, outFile, plan, seedPath, tmpName, tmpFile))
    }
    catch (err) {
        throw toPptcError(err)
    }
    finally {
        rmSync(tmpFile, { force: true })
    }
}
