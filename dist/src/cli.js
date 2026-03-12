#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { runCloak } from './app/runCloak.js';
async function readPackageVersion(importMetaUrl = import.meta.url) {
    for (const relativePath of ['../package.json', '../../package.json']) {
        try {
            const raw = await readFile(new URL(relativePath, importMetaUrl), 'utf8');
            const pkg = JSON.parse(raw);
            if (typeof pkg.version === 'string' && pkg.version.length > 0) {
                return pkg.version;
            }
        }
        catch {
            continue;
        }
    }
    throw new Error('Cannot read package version');
}
export async function runCli(argv = process.argv, writeLine = console.log) {
    const [, , directPath] = argv;
    if (directPath === '-v' || directPath === '--version') {
        writeLine(await readPackageVersion());
        return;
    }
    await runCloak({ directPath });
}
runCli().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
});
