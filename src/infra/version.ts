/*
**  pptc -- Deterministic PowerPoint CLI for LLM Agents
**  Copyright (c) 2026 Matthias Brusdeylins
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
**
**  infra/version: version facts and the passive update check. The check is
**  cached (one registry query per day), offline-tolerant, and feeds the
**  `update` field of the envelope -- the hook the skill uses to keep the
**  installed CLI current without user intervention.
*/

import { readFileSync, writeFileSync, statSync } from "node:fs"
import path from "node:path"
import { cacheDir } from "./fs.js"

/**  current CLI version (injected at build time, dev fallback otherwise)  */
export const VERSION: string = typeof PPTC_VERSION !== "undefined" ? PPTC_VERSION : "0.0.0-dev"

/**  npm package name (injected at build time, dev fallback otherwise)  */
export const PACKAGE: string = typeof PPTC_PACKAGE !== "undefined" ? PPTC_PACKAGE : "@brusdeylins/pptc"

/**  update facts appended to every envelope when a newer version exists  */
export interface UpdateInfo {
    /**  installed version  */
    current: string
    /**  latest version on the npm registry  */
    latest: string
}

/**  cache validity of the registry check in milliseconds (one day)  */
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 *  Query the npm registry for the latest published version, at most once per
 *  day (cached). Network errors and timeouts are swallowed -- the check must
 *  never break or slow down normal operation.
 *
 *  @returns update info when a newer version exists, otherwise null
 */
export const checkForUpdate = async (): Promise<UpdateInfo | null> => {
    if (VERSION === "0.0.0-dev")
        return null
    const cacheFile = path.join(cacheDir(), "latest-version.json")
    let latest: string | null = null
    try {
        const age = Date.now() - statSync(cacheFile).mtimeMs
        if (age < CHECK_INTERVAL_MS)
            latest = (JSON.parse(readFileSync(cacheFile, "utf8")) as { latest: string }).latest
    }
    catch { /* no usable cache */ }
    if (latest === null) {
        try {
            const res = await fetch(
                `https://registry.npmjs.org/${PACKAGE}/latest`,
                { signal: AbortSignal.timeout(2000) })
            if (!res.ok)
                return null
            latest = ((await res.json()) as { version: string }).version
            writeFileSync(cacheFile, JSON.stringify({ latest }))
        }
        catch {
            return null
        }
    }
    return latest !== null && latest !== VERSION
        ? { current: VERSION, latest }
        : null
}
