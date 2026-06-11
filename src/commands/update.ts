/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  commands/update: self-update via npm. The explicit counterpart of the
**  passive version hint in the envelope -- an agent seeing `update` in any
**  result runs this command to stay current.
*/

import { spawnSync } from "node:child_process"
import { PptcError } from "../core/errors.js"
import { checkForUpdate, PACKAGE, VERSION } from "../infra/version.js"

/**
 *  CLI command `pptc update`.
 *
 *  @returns versions before/after, or up-to-date facts
 *  @throws PptcError E_ENGINE when npm fails
 */
export const cmdUpdate = async (): Promise<Record<string, unknown>> => {
    const update = await checkForUpdate()
    if (update === null)
        return { result: { current: VERSION, status: "up-to-date" } }
    const npm = spawnSync("npm", ["install", "-g", `${PACKAGE}@latest`], { encoding: "utf8" })
    if (npm.status !== 0)
        throw new PptcError("E_ENGINE",
            `npm install -g ${PACKAGE}@latest failed (exit ${npm.status})`,
            { stderr: (npm.stderr ?? "").slice(-2000) })
    return { result: { previous: update.current, installed: update.latest, status: "updated" } }
}
