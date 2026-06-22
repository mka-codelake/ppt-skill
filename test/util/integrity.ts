/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  test/util/integrity: thin wrapper over the SHIPPED validator
**  (src/engine/verify). Tests assert against the exact code that runs inside
**  `apply` and `pptc verify` on a user's machine -- not a parallel copy that
**  could drift from it.
*/

import { verifyFile } from "../../src/engine/verify.js"

/**
 *  Validate a written deck for the known PowerPoint repair triggers.
 *
 *  @param file - path of the .pptx to check
 *  @returns list of human-readable findings; empty when the deck is clean
 */
export const integrityFindings = async (file: string): Promise<string[]> =>
    await verifyFile(file)

/**
 *  Assert helper: throws with all findings when the deck is not clean.
 *
 *  @param file - path of the .pptx to check
 */
export const expectIntact = async (file: string): Promise<void> => {
    const findings = await integrityFindings(file)
    if (findings.length > 0)
        throw new Error(`deck integrity violated:\n  ${findings.join("\n  ")}`)
}
