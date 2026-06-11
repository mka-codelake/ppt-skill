/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  Golden: the `tpl describe` Markdown for the fixture template is pinned as
**  a snapshot. A diff here means the LLM-facing contract changed -- review
**  deliberately, then update the snapshot.
*/

import { describe, expect, it } from "vitest"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { DeckArchive, readTemplateInfo } from "../../src/engine/reader.js"
import { narrateTemplate } from "../../src/core/describe/narrate.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE = path.join(here, "..", "fixtures", "neutral-template.pptx")

describe("tpl describe golden output", () => {
    it("matches the pinned description for the fixture template", async () => {
        const info = await readTemplateInfo(await DeckArchive.open(TEMPLATE))
        const markdown = narrateTemplate(info, "neutral-template.pptx", null)
        expect(markdown).toMatchSnapshot()
    })
})
