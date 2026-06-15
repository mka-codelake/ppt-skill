/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  skill-zip.mjs: package each skill under plugin/skills/* into a
**  claude.ai-ready ZIP (the skill folder sits at the ZIP root, e.g.
**  `ppt/SKILL.md`), written to deploy/<skill>.zip.
**
**  Flags:
**    --internal        overlay templates from ./private-templates
**    --from <dir>      overlay templates from <dir> instead (implies internal)
**
**  Either flag overlays templates (.potx/.pptx + optional <name>.md
**  sidecars) into each template-aware skill's assets/. Those templates are
**  NEVER part of the tracked tree or a git release: the public `skill:zip`
**  build ships only the neutral default, the internal build adds corporate
**  templates for in-house distribution (output suffixed `-internal`).
*/

import { readdirSync, statSync, readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import JSZip from "jszip"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
const fromIdx = args.indexOf("--from")
const fromDir = fromIdx !== -1 ? args[fromIdx + 1] : null
const internal = args.includes("--internal") || fromDir !== null
const skillsDir = path.join(root, "plugin", "skills")
const templatesSrc = fromDir ? path.resolve(fromDir) : path.join(root, "private-templates")
const outDir = path.join(root, "deploy")

/**  collect every file below dir (skipping macOS cruft)  */
const walk = (dir) => {
    const out = []
    for (const entry of readdirSync(dir)) {
        const p = path.join(dir, entry)
        if (statSync(p).isDirectory())
            out.push(...walk(p))
        else if (entry !== ".DS_Store")
            out.push(p)
    }
    return out
}

mkdirSync(outDir, { recursive: true })

if (internal && !existsSync(templatesSrc)) {
    console.error(`error: template source not found: ${templatesSrc}`)
    process.exit(1)
}
const privateFiles = internal
    ? walk(templatesSrc).filter((f) => /\.(potx|pptx|md)$/i.test(f))
    : []
if (internal && privateFiles.length === 0) {
    console.error(`error: no .potx/.pptx templates in ${templatesSrc}`)
    process.exit(1)
}
if (internal)
    console.log(`overlaying ${privateFiles.length} template file(s) from ${templatesSrc}`)

for (const name of readdirSync(skillsDir)) {
    const skillPath = path.join(skillsDir, name)
    if (!statSync(skillPath).isDirectory())
        continue
    const zip = new JSZip()
    for (const file of walk(skillPath))
        zip.file(path.posix.join(name, path.relative(skillPath, file).split(path.sep).join("/")), readFileSync(file))
    /*  overlay private templates only into skills that consume templates (have assets/)  */
    const overlay = existsSync(path.join(skillPath, "assets")) ? privateFiles : []
    for (const file of overlay)
        zip.file(path.posix.join(name, "assets", path.basename(file)), readFileSync(file))
    const outFile = path.join(outDir, `${name}${internal ? "-internal" : ""}.zip`)
    const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
    writeFileSync(outFile, buf)
    const extra = overlay.length > 0 ? `, +${overlay.length} private template file(s)` : ""
    console.log(`${path.relative(root, outFile)}  (${(buf.length / 1024).toFixed(0)} KB${extra})`)
}
