/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
*/

import { describe, expect, it } from "vitest"
import { parseSelector, resolveSlide } from "../../src/core/selector.js"
import { PptcError } from "../../src/infra/errors.js"

const slides = [
    { id: 256, index: 0, title: "Intro" },
    { id: 257, index: 1, title: "Agenda" },
    { id: 258, index: 2, title: "Agenda" },
    { id: 259, index: 3, title: null }
]

describe("parseSelector", () => {
    it("parses all selector kinds", () => {
        expect(parseSelector("id:256")).toEqual({ kind: "id", id: 256 })
        expect(parseSelector("title:Agenda")).toEqual({ kind: "title", title: "Agenda" })
        expect(parseSelector("index:2")).toEqual({ kind: "index", index: 2 })
        expect(parseSelector("$intro")).toEqual({ kind: "ref", ref: "intro" })
        expect(parseSelector("3")).toEqual({ kind: "index", index: 3 })
    })
    it("rejects malformed selectors", () => {
        expect(() => parseSelector("slide-one")).toThrowError(PptcError)
    })
})

describe("resolveSlide", () => {
    const refs = new Map([["intro", 256]])
    it("resolves by id, index, unique title and ref", () => {
        expect(resolveSlide("id:257", slides, refs).index).toBe(1)
        expect(resolveSlide("index:3", slides, refs).id).toBe(259)
        expect(resolveSlide("title:Intro", slides, refs).id).toBe(256)
        expect(resolveSlide("$intro", slides, refs).id).toBe(256)
    })
    it("fails on ambiguous titles with candidates", () => {
        try {
            resolveSlide("title:Agenda", slides, refs)
            expect.unreachable()
        }
        catch (err) {
            expect((err as PptcError).code).toBe("E_ADDR_AMBIGUOUS")
            expect((err as PptcError).details).toMatchObject({
                candidates: [{ id: 257 }, { id: 258 }]
            })
        }
    })
    it("fails on unknown addresses with the right codes", () => {
        expect(() => resolveSlide("id:999", slides, refs)).toThrowError(/no slide with id/)
        expect(() => resolveSlide("index:9", slides, refs)).toThrowError(/out of range/)
        expect(() => resolveSlide("$nope", slides, refs)).toThrowError(/unknown ref/)
    })
})
