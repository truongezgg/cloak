import { readdir, realpath } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { PREFERRED_MATCHERS } from '../constants.js'

export type SelectableFile = {
  name: string
  path: string
}

function isPreferred(name: string): boolean {
  return PREFERRED_MATCHERS.some((matcher) => matcher.test(name))
}

function isExcluded(name: string): boolean {
  return name === 'package.json' || name === 'package-lock.json'
}

function isPreferredDelta(left: SelectableFile, right: SelectableFile): number {
  return Number(isPreferred(right.name)) - Number(isPreferred(left.name))
}

export async function listSelectableFiles(rootDir: string): Promise<SelectableFile[]> {
  const canonicalRoot = await realpath(rootDir)
  const entries = await readdir(canonicalRoot, { withFileTypes: true })
  const files: SelectableFile[] = []

  for (const entry of entries) {
    if (!entry.isFile() && !entry.isSymbolicLink()) {
      continue
    }

    if (isExcluded(entry.name)) {
      continue
    }

    const filePath = join(canonicalRoot, entry.name)

    let resolved: string
    try {
      resolved = await realpath(filePath)
    } catch {
      continue
    }

    const withinRoot = resolved === canonicalRoot || resolved.startsWith(`${canonicalRoot}${sep}`)
    if (!withinRoot) {
      continue
    }

    files.push({ name: entry.name, path: filePath })
  }

  return files.sort((left, right) => {
    const preferredDelta = isPreferredDelta(left, right)
    if (preferredDelta !== 0) {
      return preferredDelta
    }

    return left.name.localeCompare(right.name)
  })
}
