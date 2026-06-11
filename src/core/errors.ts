/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  core/errors: the single error taxonomy of pptc. Every failure travels as a
**  typed PptcError carrying a stable machine-readable code and the process
**  exit code derived from its error class. Nothing in pptc throws strings.
*/

/**
 *  Stable error codes, grouped by error class. The numeric exit code of the
 *  process is determined by the class, never by the individual code.
 */
export type ErrorCode =
    | "E_USAGE"          /*  unknown command, missing argument          */
    | "E_SCHEMA"         /*  ops/payload failed schema validation       */
    | "E_JSON"           /*  payload is not parseable JSON              */
    | "E_ADDR_NOTFOUND"  /*  slide/placeholder/element does not exist   */
    | "E_ADDR_AMBIGUOUS" /*  selector matches more than one target      */
    | "E_FILE"           /*  file or directory missing or unreadable    */
    | "E_TEMPLATE"       /*  template missing, malformed, or required   */
    | "E_ENGINE"         /*  unexpected failure inside the OOXML engine */
    | "E_REV_CONFLICT"   /*  expectRev does not match the deck state    */
    | "E_LINT"           /*  lint findings escalated by --strict        */

/**
 *  Process exit code per error class (0 is success and not listed).
 */
const EXIT_CODES: Record<ErrorCode, number> = {
    E_USAGE: 2,
    E_SCHEMA: 2,
    E_JSON: 2,
    E_ADDR_NOTFOUND: 3,
    E_ADDR_AMBIGUOUS: 3,
    E_FILE: 4,
    E_TEMPLATE: 4,
    E_ENGINE: 5,
    E_REV_CONFLICT: 6,
    E_LINT: 7
}

/**
 *  The one and only error type used across pptc. Carries everything the CLI
 *  envelope needs to render a self-explanatory, machine-readable failure.
 */
export class PptcError extends Error {
    /**  stable machine-readable error code  */
    readonly code: ErrorCode
    /**  process exit code derived from the error class  */
    readonly exitCode: number
    /**  structured context for self-correction (e.g. Zod issues, candidates)  */
    readonly details: unknown

    /**
     *  Create a typed pptc error.
     *
     *  @param code - stable error code determining the exit code
     *  @param message - human-readable, single-sentence explanation
     *  @param details - optional structured context rendered into the envelope
     */
    constructor(code: ErrorCode, message: string, details?: unknown) {
        super(message)
        this.name = "PptcError"
        this.code = code
        this.exitCode = EXIT_CODES[code]
        this.details = details ?? null
    }
}

/**
 *  Coerce an arbitrary thrown value into a PptcError. Unknown failures are
 *  classified as engine errors so they still produce a structured envelope.
 *
 *  @param err - the caught value
 *  @returns the value itself if already a PptcError, otherwise an E_ENGINE wrapper
 */
export const toPptcError = (err: unknown): PptcError => {
    if (err instanceof PptcError)
        return err
    const message = err instanceof Error ? err.message : String(err)
    return new PptcError("E_ENGINE", message)
}
