/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  Contract: the engine the SKILL ships must equal the built engine. The
**  skill runs its own embedded copy (plugin/skills/ppt/scripts/pptc.mjs),
**  updated only by `npm run plugin:sync`. If that copy drifts from
**  dst/pptc.mjs, the skill silently distributes an OLD engine to fresh
**  machines (e.g. missing a repair fix) -- exactly the failure this guards.
*/

import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, "..", "..")
const built = path.join(root, "dst", "pptc.mjs")
const bundled = path.join(root, "plugin", "skills", "ppt", "scripts", "pptc.mjs")

describe("skill bundle sync contract", () => {
    it("the skill's bundled engine equals the built engine (run 'npm run plugin:sync')", () => {
        /*  `npm test` builds dst via pretest, so it is always present here  */
        expect(existsSync(built), "dst/pptc.mjs missing -- run 'npm run build'").toBe(true)
        expect(existsSync(bundled), "skill bundle missing").toBe(true)
        expect(
            readFileSync(bundled, "utf8") === readFileSync(built, "utf8"),
            "plugin/skills/ppt/scripts/pptc.mjs is stale -- run 'npm run plugin:sync'"
        ).toBe(true)
    })

    it("both skills' bundled VERSION files match package.json", () => {
        const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { version: string }
        const files = [
            path.join(root, "plugin", "skills", "ppt", "VERSION"),
            path.join(root, "plugin", "skills", "ppt-prepare", "VERSION")
        ]
        for (const f of files)
            expect(readFileSync(f, "utf8").trim(), `${f} is stale -- run 'npm run plugin:sync'`).toBe(pkg.version)
    })
})
