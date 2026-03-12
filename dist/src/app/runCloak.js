import { join } from 'node:path';
import { access, readFile, realpath } from 'node:fs/promises';
import { decodeTextFile, encodeTextFile } from '../crypto/fileCipher.js';
import { listSelectableFiles } from '../files/listFiles.js';
import { loadLocalPassword, saveLocalPassword } from '../files/localPassword.js';
import { decodeUtf8Text, firstLineMatchesMarker, isLikelyTextBuffer } from '../files/readFileState.js';
import { resolveTarget } from '../files/resolveTarget.js';
import { writeOutput as writeOutputFile } from '../files/writeOutput.js';
import { createPromptPort, outsideRootMessage } from '../ui/prompts.js';
function isUserCancel(error) {
    return error instanceof Error && error.message === 'User cancelled';
}
async function withUserCancelExit(operation) {
    try {
        return await operation();
    }
    catch (error) {
        if (isUserCancel(error)) {
            return undefined;
        }
        throw error;
    }
}
export async function runCloak(options = {}) {
    const cwd = options.cwd ?? process.cwd();
    const prompts = options.prompts ?? createPromptPort();
    const resolveTargetPath = options.resolveTargetPath ?? resolveTarget;
    const writeOutput = options.writeOutput ?? writeOutputFile;
    const rootDir = await realpath(cwd);
    const configPath = join(rootDir, '.cloak');
    let sessionPassword = await loadLocalPassword(rootDir);
    let configFound = sessionPassword !== null;
    if (!sessionPassword) {
        const enteredPassword = await withUserCancelExit(() => prompts.askLocalPassword({ rootDir, configPath, configFound }));
        if (enteredPassword === undefined) {
            return;
        }
        sessionPassword = enteredPassword;
        await saveLocalPassword(rootDir, sessionPassword);
        configFound = true;
    }
    let selectedPath;
    if (options.directPath) {
        selectedPath = options.directPath;
    }
    else {
        const files = await listSelectableFiles(rootDir);
        const picked = await withUserCancelExit(() => prompts.selectFile(files, { rootDir, configPath, configFound }));
        if (picked === undefined) {
            return;
        }
        selectedPath = picked;
    }
    let target;
    try {
        target = await resolveTargetPath(rootDir, selectedPath);
    }
    catch {
        await prompts.showMessage('Cannot read file');
        throw new Error('Cannot read file');
    }
    if (target.outsideRoot) {
        await prompts.showMessage(outsideRootMessage(target.sourcePath));
        throw new Error('File is outside the current directory');
    }
    if (target.isWorkspacePasswordFile) {
        await prompts.showMessage('Cannot read file');
        throw new Error('Cannot read file');
    }
    let currentText;
    try {
        const fileBytes = await readFile(target.sourcePath);
        if (!isLikelyTextBuffer(fileBytes)) {
            throw new Error('Not text');
        }
        currentText = decodeUtf8Text(fileBytes);
    }
    catch {
        await prompts.showMessage('Cannot read file');
        throw new Error('Cannot read file');
    }
    if (target.outputPath === target.sourcePath) {
        await prompts.showMessage('Cannot write file');
        throw new Error('Cannot write file');
    }
    const action = target.action;
    if (action === 'decode' && !firstLineMatchesMarker(currentText)) {
        throw new Error('File is not protected by Cloak');
    }
    let overwrite = false;
    try {
        await access(target.outputPath);
        overwrite = true;
    }
    catch {
        overwrite = false;
    }
    let confirmed;
    try {
        confirmed = await prompts.confirmAction(action, target.sourcePath, target.outputPath, overwrite, {
            rootDir,
            configPath,
            configFound,
        });
    }
    catch (error) {
        if (isUserCancel(error)) {
            return;
        }
        throw error;
    }
    if (!confirmed) {
        return;
    }
    const nextText = action === 'encode'
        ? await encodeTextFile(currentText, sessionPassword)
        : await decodeTextFile(currentText, sessionPassword);
    try {
        await writeOutput(target.outputPath, nextText);
    }
    catch {
        await prompts.showMessage('Cannot write file');
        throw new Error('Cannot write file');
    }
    await prompts.showMessage(action === 'encode' ? 'File encoded successfully' : 'File decoded successfully');
}
