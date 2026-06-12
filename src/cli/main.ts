/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  cli/main: the entry point. Dispatches commands, renders exactly one JSON
**  envelope on stdout, maps the error taxonomy to exit codes. All logging
**  goes to stderr; stdout belongs to the envelope.
*/

import { PptcError, toPptcError } from "../core/errors.js"
import { checkForUpdate, VERSION } from "../infra/version.js"
import { cmdApply } from "../commands/apply.js"
import { cmdNew } from "../commands/new.js"
import { cmdSchema } from "../commands/schema.js"
import { cmdState } from "../commands/state.js"
import { cmdFooter, cmdMove, cmdNote, cmdRm, cmdText } from "../commands/sugar.js"
import { cmdTplDescribe, cmdTplInspect, cmdTplList, cmdTplValidate } from "../commands/tpl.js"
import { cmdUpdate } from "../commands/update.js"

/**  one-line usage summary printed on `pptc help` and usage errors  */
const USAGE = `pptc ${VERSION} -- deterministic PowerPoint CLI for LLM agents

Read templates:   tpl list <dir> | tpl describe <tpl> | tpl inspect <tpl> | tpl validate <tpl>
Read decks:       state <deck> [--slide SEL] [--level summary|text|full]
Write decks:      new <deck> --template <tpl> [--ops @file]
                  apply <deck> (--ops @file|- | -e '<op>') [--template <tpl>] [--dry-run] [--strict] [--rev R] [--out F]
Micro edits:      text|note|footer|rm|move <deck> --slide SEL ...
Self-description: schema [op] | help | update

Slide selectors:  id:N | title:... | index:N | $ref | bare index
Exit codes:       0 ok, 2 input, 3 addressing, 4 file, 5 engine, 6 rev conflict, 7 lint`

/**  command dispatch table  */
const COMMANDS: Record<string, (argv: string[]) => unknown> = {
    "state": cmdState,
    "new": cmdNew,
    "apply": cmdApply,
    "schema": cmdSchema,
    "update": () => cmdUpdate(),
    "text": cmdText,
    "note": cmdNote,
    "footer": cmdFooter,
    "rm": cmdRm,
    "move": cmdMove,
    "help": () => ({ result: { usage: USAGE } }),
    "--version": () => ({ result: { version: VERSION } })
}

/**  tpl subcommand dispatch table  */
const TPL_COMMANDS: Record<string, (argv: string[]) => unknown> = {
    "list": cmdTplList,
    "describe": cmdTplDescribe,
    "inspect": cmdTplInspect,
    "validate": cmdTplValidate
}

/**  render the envelope and exit  */
const emit = (envelope: Record<string, unknown>, exitCode: number): void => {
    process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`)
    process.exitCode = exitCode
}

/**
 *  CLI main: dispatch, execute, render the envelope.
 */
const main = async (): Promise<void> => {
    const [cmd, ...rest] = process.argv.slice(2)
    let name = cmd ?? "help"
    let handler: ((argv: string[]) => unknown) | undefined
    let argv = rest
    if (name === "tpl") {
        const sub = rest[0] ?? ""
        handler = TPL_COMMANDS[sub]
        name = `tpl ${sub}`
        argv = rest.slice(1)
    }
    else
        handler = COMMANDS[name]

    try {
        if (handler === undefined)
            throw new PptcError("E_USAGE", `unknown command '${name}'`,
                { usage: USAGE.split("\n") })
        const payload = (await handler(argv)) as Record<string, unknown>
        /*  human escape hatch: a `plain` payload bypasses the JSON
            envelope and prints raw text (e.g. `tpl describe --plain`)  */
        if (typeof payload["plain"] === "string") {
            process.stdout.write(`${payload["plain"]}\n`)
            process.exitCode = 0
            return
        }
        const update = await checkForUpdate()
        emit({
            ok: true,
            cmd: name,
            ...payload,
            ...(update !== null && { update })
        }, 0)
    }
    catch (err) {
        const error = toPptcError(err)
        emit({
            ok: false,
            cmd: name,
            error: { code: error.code, message: error.message, details: error.details }
        }, error.exitCode)
    }
}

await main()
