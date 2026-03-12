#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { runCloak } from './app/runCloak.js'

async function readPackageVersion(importMetaUrl = import.meta.url): Promise<string> {
  for (const relativePath of ['../package.json', '../../package.json']) {
    try {
      const raw = await readFile(new URL(relativePath, importMetaUrl), 'utf8')
      const pkg = JSON.parse(raw) as { version?: unknown }
      if (typeof pkg.version === 'string' && pkg.version.length > 0) {
        return pkg.version
      }
    } catch {
      continue
    }
  }

  throw new Error('Cannot read package version')
}

export async function runCli(argv = process.argv, writeLine: (line: string) => void = console.log): Promise<void> {
  const [, , directPath] = argv

  if (directPath === '-v' || directPath === '--version') {
    writeLine(await readPackageVersion())
    return
  }

  await runCloak({ directPath })
}

const entryHref = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined

if (entryHref === import.meta.url) {
  runCli().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exitCode = 1
  })
}
