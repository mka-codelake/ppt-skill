/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  core/selector: the slide selector grammar and its pure resolver. A selector
**  addresses a slide by stable id, exact title, position, or a document-local
**  `$ref` created earlier in the same ops run. Ambiguity is an error, never a
**  silent first-match.
*/

import { PptcError } from "./errors.js"

/**  Parsed form of a slide selector string.  */
export type SlideSelector =
    | { kind: "id", id: number }
    | { kind: "title", title: string }
    | { kind: "index", index: number }
    | { kind: "ref", ref: string }

/**  The minimal slide facts the resolver needs (subset of SlideInfo).  */
export interface SelectableSlide {
    /**  stable OOXML slide id  */
    id: number
    /**  zero-based position  */
    index: number
    /**  slide title, null if empty  */
    title: string | null
}

/**
 *  Parse a selector string into its structured form.
 *
 *  @param selector - raw selector (`id:N`, `title:...`, `index:N`, `$ref`, bare digits)
 *  @returns the parsed selector
 *  @throws PptcError E_USAGE when the string matches no grammar rule
 */
export const parseSelector = (selector: string): SlideSelector => {
    if (/^\d+$/.test(selector))
        return { kind: "index", index: Number(selector) }
    if (selector.startsWith("id:"))
        return { kind: "id", id: Number(selector.slice(3)) }
    if (selector.startsWith("index:"))
        return { kind: "index", index: Number(selector.slice(6)) }
    if (selector.startsWith("title:"))
        return { kind: "title", title: selector.slice(6) }
    if (selector.startsWith("$"))
        return { kind: "ref", ref: selector.slice(1) }
    throw new PptcError("E_USAGE",
        `invalid slide selector '${selector}'`,
        { expected: ["id:N", "title:...", "index:N", "$ref", "bare index"] })
}

/**
 *  Resolve a selector against the current slide list of a deck.
 *
 *  @param selector - raw selector string
 *  @param slides - current slides in presentation order
 *  @param refs - map of document-local refs to slide ids (from earlier ops)
 *  @returns the matching slide
 *  @throws PptcError E_ADDR_NOTFOUND when nothing matches,
 *          E_ADDR_AMBIGUOUS when a title matches more than one slide
 */
export const resolveSlide = (
    selector: string,
    slides: readonly SelectableSlide[],
    refs: ReadonlyMap<string, number>
): SelectableSlide => {
    const sel = parseSelector(selector)
    if (sel.kind === "id") {
        const slide = slides.find((s) => s.id === sel.id)
        if (slide === undefined)
            throw new PptcError("E_ADDR_NOTFOUND", `no slide with id ${sel.id}`,
                { available: slides.map((s) => ({ id: s.id, index: s.index, title: s.title })) })
        return slide
    }
    if (sel.kind === "index") {
        const slide = slides[sel.index]
        if (slide === undefined)
            throw new PptcError("E_ADDR_NOTFOUND",
                `slide index ${sel.index} out of range (0-${slides.length - 1})`)
        return slide
    }
    if (sel.kind === "title") {
        const matches = slides.filter((s) => s.title === sel.title)
        if (matches.length === 0)
            throw new PptcError("E_ADDR_NOTFOUND", `no slide titled '${sel.title}'`,
                { titles: slides.map((s) => s.title) })
        if (matches.length > 1)
            throw new PptcError("E_ADDR_AMBIGUOUS",
                `title '${sel.title}' matches ${matches.length} slides, use 'id:N'`,
                { candidates: matches.map((s) => ({ id: s.id, index: s.index })) })
        return matches[0] as SelectableSlide
    }
    const id = refs.get(sel.ref)
    if (id === undefined)
        throw new PptcError("E_ADDR_NOTFOUND",
            `unknown ref '$${sel.ref}' (no earlier op defined it)`,
            { knownRefs: [...refs.keys()] })
    return resolveSlide(`id:${id}`, slides, refs)
}
