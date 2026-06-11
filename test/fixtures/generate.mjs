/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  generate.mjs: build the neutral template fixture used by the test suite.
**  Creates a small .pptx with three slide masters (PptxGenJS renders each
**  defined master as its own slide layout): title, content, two-column.
**  Run once: node test/fixtures/generate.mjs
*/

import PptxGenJS from "pptxgenjs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const pptx = new PptxGenJS()
pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 })
pptx.layout = "WIDE"

pptx.defineSlideMaster({
    title: "TITLE_SLIDE",
    background: { color: "FFFFFF" },
    objects: [
        { placeholder: { options: { name: "title", type: "title", x: 0.7, y: 2.5, w: 12, h: 1.5 }, text: "Titel" } },
        { placeholder: { options: { name: "subtitle", type: "body", x: 0.7, y: 4.2, w: 12, h: 0.6 }, text: "Untertitel" } }
    ]
})
pptx.defineSlideMaster({
    title: "CONTENT",
    background: { color: "FFFFFF" },
    objects: [
        { placeholder: { options: { name: "title", type: "title", x: 0.7, y: 0.4, w: 12, h: 1.0 }, text: "Titel" } },
        { placeholder: { options: { name: "content", type: "body", x: 0.7, y: 1.8, w: 12, h: 5.0 }, text: "Inhalt" } }
    ]
})
pptx.defineSlideMaster({
    title: "TWO_COLUMN",
    background: { color: "FFFFFF" },
    objects: [
        { placeholder: { options: { name: "title", type: "title", x: 0.7, y: 0.4, w: 12, h: 1.0 }, text: "Titel" } },
        { placeholder: { options: { name: "left", type: "body", x: 0.7, y: 1.8, w: 5.8, h: 5.0 }, text: "Links" } },
        { placeholder: { options: { name: "right", type: "body", x: 6.9, y: 1.8, w: 5.8, h: 5.0 }, text: "Rechts" } }
    ]
})

/*  one slide per master so every layout is materialized  */
pptx.addSlide({ masterName: "TITLE_SLIDE" })
pptx.addSlide({ masterName: "CONTENT" })
pptx.addSlide({ masterName: "TWO_COLUMN" })

await pptx.writeFile({ fileName: path.join(here, "neutral-template.pptx") })
console.log("fixture written: neutral-template.pptx")
