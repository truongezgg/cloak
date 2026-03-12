import { realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';
function isInsideRoot(rootDir, targetPath) {
    return targetPath === rootDir || targetPath.startsWith(`${rootDir}${sep}`);
}
export async function resolveTarget(rootDir, inputPath) {
    const canonicalRoot = await realpath(rootDir);
    const rawPath = isAbsolute(inputPath) ? inputPath : resolve(rootDir, inputPath);
    const sourcePath = await realpath(rawPath);
    const workspacePasswordPath = join(canonicalRoot, '.cloak');
    const isWorkspacePasswordFile = sourcePath === workspacePasswordPath;
    const action = sourcePath.endsWith('.cloak') ? 'decode' : 'encode';
    const outputPath = action === 'encode' ? `${sourcePath}.cloak` : sourcePath.slice(0, -'.cloak'.length);
    return {
        sourcePath,
        outputPath,
        action,
        outsideRoot: !isInsideRoot(canonicalRoot, sourcePath),
        isWorkspacePasswordFile,
    };
}
