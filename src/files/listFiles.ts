import { readdir, realpath, stat } from 'node:fs/promises'
import { join, posix, sep } from 'node:path'
import { PREFERRED_MATCHERS } from '../constants.js'

export type SelectableFile = {
  name: string
  path: string
}

function isPreferred(name: string): boolean {
  return PREFERRED_MATCHERS.some((matcher) => matcher.test(name))
}

function isExcluded(name: string): boolean {
  const lower = name.toLowerCase()
  return (
    name === 'package.json' ||
    name === 'package-lock.json' ||
    lower.endsWith('.md')
  )
}

function isExcludedDirectory(name: string): boolean {
  return (
    name === 'node_modules' ||
    name === '.git' ||
    name === '.claude' ||
    name === 'dist' ||
    name === 'build'
  )
}

function getBasename(path: string): string {
  const segments = path.split(posix.sep)
  return segments.pop() ?? path
}

function isCloakFile(path: string): boolean {
  return getBasename(path).endsWith('.cloak')
}

function displayName(path: string): string {
  return isCloakFile(path) ? `${path} 🔒` : path
}

function cloakFirstDelta(left: SelectableFile, right: SelectableFile): number {
  const leftCloak = isCloakFile(left.name)
  const rightCloak = isCloakFile(right.name)

  return Number(rightCloak) - Number(leftCloak)
}

function priorityCategory(name: string): number {
  const base = getBasename(name)
  if (isCloakFile(name)) {
    return 0
  }
  if (/^\.env(?:\..+)?$/i.test(base)) {
    return 1
  }
  if (/\.pem$/i.test(base) || /\.key$/i.test(base) || /\.cer$/i.test(base)) {
    return 2
  }
  if (/\.json$/i.test(base)) {
    return 3
  }
  return 4
}

function isPreferredDelta(left: SelectableFile, right: SelectableFile): number {
  const leftPreferred = isPreferred(getBasename(left.name))
  const rightPreferred = isPreferred(getBasename(right.name))

  return Number(rightPreferred) - Number(leftPreferred)
}

async function collectSelectableEntries(
  dirPath: string,
  relativeBase: string,
  canonicalRoot: string,
  files: SelectableFile[]
): Promise<void> {
  const entries = await readdir(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    const isAtRoot = relativeBase === ''
    if (isAtRoot && entry.name === '.cloak') {
      continue
    }

    if (isExcluded(entry.name)) {
      continue
    }

    if (entry.isDirectory() && isExcludedDirectory(entry.name)) {
      continue
    }

    const relativeName = relativeBase ? posix.join(relativeBase, entry.name) : entry.name
    const entryPath = join(dirPath, entry.name)

    let resolved: string
    try {
      resolved = await realpath(entryPath)
    } catch {
      continue
    }

    const withinRoot = resolved === canonicalRoot || resolved.startsWith(`${canonicalRoot}${sep}`)
    if (!withinRoot) {
      continue
    }

    let entryStats
    try {
      entryStats = await stat(resolved)
    } catch {
      continue
    }

    if (entryStats.isDirectory()) {
      if (entry.isSymbolicLink()) {
        continue
      }

      await collectSelectableEntries(resolved, relativeName, canonicalRoot, files)
      continue
    }

    if (!entryStats.isFile()) {
      continue
    }

    files.push({ name: relativeName, path: resolved })
  }
}

export async function listSelectableFiles(rootDir: string): Promise<SelectableFile[]> {
  const canonicalRoot = await realpath(rootDir)
  const files: SelectableFile[] = []

  await collectSelectableEntries(canonicalRoot, '', canonicalRoot, files)

  return files
    .sort((left, right) => {
      const cloakDelta = cloakFirstDelta(left, right)
      if (cloakDelta !== 0) {
        return cloakDelta
      }

      const categoryDelta = priorityCategory(left.name) - priorityCategory(right.name)
      if (categoryDelta !== 0) {
        return categoryDelta
      }

      const preferredDelta = isPreferredDelta(left, right)
      if (preferredDelta !== 0) {
        return preferredDelta
      }

      return left.name.localeCompare(right.name)
    })
    .map((file) => ({ ...file, name: displayName(file.name) }))
}
