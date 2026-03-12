import { realpath } from 'node:fs/promises'
import { isAbsolute, join, resolve, sep } from 'node:path'
import type { ActionKind } from '../app/types.js'

export type ResolvedTarget = {
  sourcePath: string
  outputPath: string
  action: ActionKind
  outsideRoot: boolean
  isWorkspacePasswordFile: boolean
}

function isInsideRoot(rootDir: string, targetPath: string): boolean {
  return targetPath === rootDir || targetPath.startsWith(`${rootDir}${sep}`)
}

export async function resolveTarget(rootDir: string, inputPath: string): Promise<ResolvedTarget> {
  const canonicalRoot = await realpath(rootDir)
  const rawPath = isAbsolute(inputPath) ? inputPath : resolve(rootDir, inputPath)
  const sourcePath = await realpath(rawPath)
  const workspacePasswordPath = join(canonicalRoot, '.cloak')
  const isWorkspacePasswordFile = sourcePath === workspacePasswordPath
  const action: ActionKind = sourcePath.endsWith('.cloak') ? 'decode' : 'encode'
  const outputPath = action === 'encode' ? `${sourcePath}.cloak` : sourcePath.slice(0, -'.cloak'.length)

  return {
    sourcePath,
    outputPath,
    action,
    outsideRoot: !isInsideRoot(canonicalRoot, sourcePath),
    isWorkspacePasswordFile,
  }
}
