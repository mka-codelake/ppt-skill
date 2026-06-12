/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  Contract: every error class maps to its exit code and the envelope shape
**  is stable. Runs the built bundle (dst/pptc.mjs) -- `npm test` builds first.
*/

import { beforeAll, describe, expect, it } from "vitest"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { buildEmptyDeck } from "../../src/engine/seed.js"
import { expectIntact } from "../util/integrity.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const BIN = path.join(here, "..", "..", "dst", "pptc.mjs")
const TEMPLATE = path.join(here, "..", "fixtures", "neutral-template.pptx")
const TMP = path.join(here, "..", "tmp")
const DECK = path.join(TMP, "contract.pptx")

/**  run the CLI bundle and parse its envelope  */
const run = (...argv: string[]): { exit: number, envelope: Record<string, unknown> } => {
    const proc = spawnSync("node", [BIN, ...argv], { encoding: "utf8" })
    return { exit: proc.status ?? -1, envelope: JSON.parse(proc.stdout) as Record<string, unknown> }
}

beforeAll(async () => {
    mkdirSync(TMP, { recursive: true })
    writeFileSync(DECK, await buildEmptyDeck(TEMPLATE))
})

describe("envelope and exit-code contract", () => {
    it.skipIf(!existsSync(BIN))("exit 0: ok envelope with cmd and result", () => {
        const { exit, envelope } = run("state", DECK)
        expect(exit).toBe(0)
        expect(envelope).toMatchObject({ ok: true, cmd: "state" })
        expect(envelope["rev"]).toBeTypeOf("string")
    })
    it.skipIf(!existsSync(BIN))("exit 2: schema violation carries issue details", () => {
        const { exit, envelope } = run("apply", DECK, "-e", "{\"op\":\"slide.fill\"}")
        expect(exit).toBe(2)
        expect(envelope).toMatchObject({ ok: false, error: { code: "E_SCHEMA" } })
    })
    it.skipIf(!existsSync(BIN))("exit 3: addressing failure", () => {
        const { exit, envelope } = run("apply", DECK, "-e", "{\"op\":\"slide.rm\",\"slide\":\"id:9\"}")
        expect(exit).toBe(3)
        expect((envelope["error"] as { code: string }).code).toMatch(/^E_ADDR/)
    })
    it.skipIf(!existsSync(BIN))("exit 4: missing file", () => {
        const { exit } = run("state", path.join(TMP, "missing.pptx"))
        expect(exit).toBe(4)
    })
    it.skipIf(!existsSync(BIN))("exit 6: revision conflict", () => {
        const { exit, envelope } = run("apply", DECK, "--rev", "stale",
            "-e", "{\"op\":\"slide.add\",\"layout\":0}", "--template", TEMPLATE)
        expect(exit).toBe(6)
        expect(envelope).toMatchObject({ ok: false, error: { code: "E_REV_CONFLICT" } })
    })
    it.skipIf(!existsSync(BIN))("exit 2: usage error on unknown command", () => {
        const { exit, envelope } = run("frobnicate")
        expect(exit).toBe(2)
        expect(envelope).toMatchObject({ ok: false, error: { code: "E_USAGE" } })
    })
    it("empty deck from buildEmptyDeck passes the file-integrity validation", async () => {
        await expectIntact(DECK)
    })
})

describe("sugar and read-command happy paths (built bundle)", () => {
    const SUGAR = path.join(TMP, "sugar.pptx")

    beforeAll(async () => {
        writeFileSync(SUGAR, await buildEmptyDeck(TEMPLATE))
    })

    it.skipIf(!existsSync(BIN))("text, note, footer, move and rm round-trip", async () => {
        let r = run("apply", SUGAR, "--template", TEMPLATE, "-e",
            "{\"op\":\"slide.add\",\"layout\":\"CONTENT\",\"placeholders\":{\"title\":{\"text\":\"Erste\"}}}")
        expect(r.envelope["ok"]).toBe(true)
        r = run("apply", SUGAR, "--template", TEMPLATE, "-e",
            "{\"op\":\"slide.add\",\"layout\":\"CONTENT\",\"placeholders\":{\"title\":{\"text\":\"Zweite\"}}}")
        expect(r.envelope["ok"]).toBe(true)

        r = run("text", SUGAR, "--slide", "title:Erste", "--ph", "body", "Sugar-Text & <ok>")
        expect(r.exit).toBe(0)
        r = run("note", SUGAR, "--slide", "title:Erste", "Sprechernotiz")
        expect(r.exit).toBe(0)
        r = run("footer", SUGAR, "Fußzeile für alle")
        expect(r.exit).toBe(0)
        r = run("move", SUGAR, "--slide", "title:Zweite", "--to", "0")
        expect(r.exit).toBe(0)
        r = run("rm", SUGAR, "--slide", "title:Zweite")
        expect(r.exit).toBe(0)

        const state = run("state", SUGAR, "--level", "full")
        const slides = (state.envelope["result"] as { slides: { title: string, notes: string }[] }).slides
        expect(slides).toHaveLength(1)
        expect(slides[0]?.title).toBe("Erste")
        expect(slides[0]?.notes).toBe("Sprechernotiz")
        await expectIntact(SUGAR)
    })

    it.skipIf(!existsSync(BIN))("tpl describe --plain prints raw markdown, no envelope", () => {
        const proc = spawnSync("node", [BIN, "tpl", "describe", TEMPLATE, "--plain"], { encoding: "utf8" })
        expect(proc.status).toBe(0)
        expect(proc.stdout).toContain("# Template:")
        expect(proc.stdout).toContain("\n")
        expect(proc.stdout.trimStart().startsWith("{")).toBe(false)
    })

    it.skipIf(!existsSync(BIN))("--plain works on help, state, tpl list and tpl validate", () => {
        for (const argv of [
            ["help", "--plain"],
            ["state", SUGAR, "--plain"],
            ["tpl", "list", path.dirname(TEMPLATE), "--plain"],
            ["tpl", "validate", TEMPLATE, "--plain"]
        ]) {
            const proc = spawnSync("node", [BIN, ...argv], { encoding: "utf8" })
            expect(proc.status, argv.join(" ")).toBe(0)
            expect(proc.stdout.trimStart().startsWith("{"), argv.join(" ")).toBe(false)
        }
    })

    it.skipIf(!existsSync(BIN))("tpl list, tpl validate and schema respond ok", () => {
        const list = run("tpl", "list", path.dirname(TEMPLATE))
        expect(list.exit).toBe(0)
        expect((list.envelope["result"] as { templates: unknown[] }).templates.length).toBeGreaterThan(0)

        const validate = run("tpl", "validate", TEMPLATE)
        expect(validate.envelope["ok"]).toBe(true)

        const schema = run("schema", "slide.fill")
        expect(schema.exit).toBe(0)
        expect(JSON.stringify(schema.envelope)).toContain("placeholders")
    })
})
