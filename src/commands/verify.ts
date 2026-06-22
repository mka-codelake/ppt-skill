/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  commands/verify: check a finished deck against every known PowerPoint
**  "repair" trigger. `apply` already self-verifies before writing; this is
**  the explicit, standalone gate a skill runs after building a deck to prove
**  it opens cleanly -- on any machine, without PowerPoint.
*/

import { PptcError } from "../infra/errors.js"
import { verifyFile } from "../engine/verify.js"
import { requireFile } from "../infra/fs.js"
import { parse } from "../infra/args.js"

/**
 *  CLI command `pptc verify <deck> [--strict]`.
 *
 *  Reports the integrity findings. With `--strict` any finding is a hard
 *  failure (exit 8); without it the command succeeds and the findings ride
 *  in the result so a caller can decide.
 *
 *  @param argv - raw arguments after the command name
 *  @returns the verification payload for the envelope
 */
export const cmdVerify = async (argv: string[]): Promise<Record<string, unknown>> => {
    const args = parse(argv, { "strict": { type: "boolean" } }, ["deck"])
    const deck = args.positionals[0] as string
    requireFile(deck, "deck")
    const findings = await verifyFile(deck)
    if (args.flag("strict") && findings.length > 0)
        throw new PptcError("E_INTEGRITY",
            `${findings.length} integrity violation(s) -- this deck will prompt a repair in PowerPoint`,
            { findings })
    return {
        file: deck,
        result: { ok: findings.length === 0, findings }
    }
}
