import { emitKeypressEvents } from "node:readline";
import { stdin } from "node:process";
import { input, password, select } from "@inquirer/prompts";
import { dirname } from "node:path";
export function actionMessage(action, sourcePath, outputPath) {
    return action === "encode"
        ? `Encode this file?\n  Source: ${sourcePath}\n  Output: ${outputPath}`
        : `Decode this file?\n  Source: ${sourcePath}\n  Output: ${outputPath}`;
}
export function overwriteWarningMessage(targetPath) {
    return `⚠️ WARNING: destination file already exists\n  Target: ${targetPath}\nThis will replace the existing file.`;
}
function shellQuoteDouble(path) {
    return `"${path
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\$/g, "\\$")
        .replace(/`/g, "\\`")}"`;
}
export function outsideRootMessage(path) {
    return `File is outside the current directory\nRun Cloak from that directory instead:\ncd ${shellQuoteDouble(dirname(path))} && cloak`;
}
function promptHeaderMessage(context) {
    const configLine = context.configFound
        ? `⚙️ : ${context.configPath}`
        : `⚙️ : not found (${context.configPath})`;
    return `Esc/q to exit\n${configLine}\n📁: ${context.rootDir}`;
}
function isExitKey(sequence, key) {
    if (key?.name === "escape") {
        return true;
    }
    return sequence === "q" && !key?.ctrl && !key?.meta;
}
function parseConfirmation(value) {
    const normalized = value.trim().toLowerCase();
    if (normalized === "y" || normalized === "yes") {
        return true;
    }
    if (normalized === "n" || normalized === "no") {
        return false;
    }
    return undefined;
}
async function runWithExitKeys(runner) {
    const controller = new AbortController();
    const onKeypress = (sequence, key) => {
        if (isExitKey(sequence, key)) {
            controller.abort();
        }
    };
    emitKeypressEvents(stdin);
    stdin.on("keypress", onKeypress);
    try {
        return await runner({ signal: controller.signal });
    }
    catch (error) {
        if (controller.signal.aborted) {
            throw new Error("User cancelled");
        }
        throw error;
    }
    finally {
        stdin.off("keypress", onKeypress);
    }
}
export function createPromptPort() {
    return {
        askLocalPassword: (promptContext) => runWithExitKeys((context) => password({
            message: `${promptHeaderMessage(promptContext)}\n\nEnter password for .cloak`,
        }, context)),
        selectFile: (files, promptContext) => runWithExitKeys((context) => select({
            message: `${promptHeaderMessage(promptContext)}\n\nChoose a file`,
            choices: files.map((file) => ({
                name: file.name,
                value: file.path,
            })),
        }, context)),
        confirmAction: (action, sourcePath, outputPath, overwrite, _promptContext) => runWithExitKeys(async (context) => {
            const answer = await input({
                message: `${overwrite ? `\n${overwriteWarningMessage(outputPath)}\n\n` : ""}${actionMessage(action, sourcePath, outputPath)}\n\nType y/yes to continue, n/no to cancel`,
                validate: (value) => parseConfirmation(value) !== undefined || "Enter y/yes or n/no",
            }, context);
            return parseConfirmation(answer) ?? false;
        }),
        showMessage: async (message) => {
            console.log(message);
        },
    };
}
