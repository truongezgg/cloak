import { emitKeypressEvents } from "node:readline";
import { stdin } from "node:process";
import { input, password, select } from "@inquirer/prompts";
import { dirname } from "node:path";
import type { ActionKind, PromptContext, PromptPort } from "../app/types.js";

type PromptRunner<T> = (context: { signal: AbortSignal }) => Promise<T>;

export function actionMessage(
  action: ActionKind,
  sourcePath: string,
  outputPath: string,
): string {
  return action === "encode"
    ? `Encode this file?\n  Source: ${sourcePath}\n  Output: ${outputPath}`
    : `Decode this file?\n  Source: ${sourcePath}\n  Output: ${outputPath}`;
}

export function overwriteWarningMessage(targetPath: string): string {
  return `⚠️ WARNING: destination file already exists\n  Target: ${targetPath}\nThis will replace the existing file.`;
}

function shellQuoteDouble(path: string): string {
  return `"${path
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`")}"`;
}

export function outsideRootMessage(path: string): string {
  return `File is outside the current directory\nRun Cloak from that directory instead:\ncd ${shellQuoteDouble(dirname(path))} && cloak`;
}

function promptHeaderMessage(context: PromptContext): string {
  const configLine = context.configFound
    ? `⚙️ : ${context.configPath}`
    : `⚙️ : not found (${context.configPath})`;

  return `Esc/q to exit\n${configLine}\n📁: ${context.rootDir}`;
}

function isExitKey(
  sequence: string,
  key?: { name?: string; ctrl?: boolean; meta?: boolean },
): boolean {
  if (key?.name === "escape") {
    return true;
  }

  return sequence === "q" && !key?.ctrl && !key?.meta;
}

function parseConfirmation(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();

  if (normalized === "y" || normalized === "yes") {
    return true;
  }

  if (normalized === "n" || normalized === "no") {
    return false;
  }

  return undefined;
}

async function runWithExitKeys<T>(runner: PromptRunner<T>): Promise<T> {
  const controller = new AbortController();
  const onKeypress = (
    sequence: string,
    key?: { name?: string; ctrl?: boolean; meta?: boolean },
  ) => {
    if (isExitKey(sequence, key)) {
      controller.abort();
    }
  };

  emitKeypressEvents(stdin);
  stdin.on("keypress", onKeypress);

  try {
    return await runner({ signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("User cancelled");
    }
    throw error;
  } finally {
    stdin.off("keypress", onKeypress);
  }
}

export function createPromptPort(): PromptPort {
  return {
    askLocalPassword: (promptContext) =>
      runWithExitKeys((context) =>
        password(
          {
            message: `${promptHeaderMessage(promptContext)}\n\nEnter password for .cloak`,
          },
          context,
        ),
      ),
    selectFile: (files, promptContext) =>
      runWithExitKeys((context) =>
        select(
          {
            message: `${promptHeaderMessage(promptContext)}\n\nChoose a file`,
            choices: files.map((file) => ({
              name: file.name,
              value: file.path,
            })),
          },
          context,
        ),
      ),
    confirmAction: (
      action,
      sourcePath,
      outputPath,
      overwrite,
      _promptContext,
    ) =>
      runWithExitKeys(async (context) => {
        const answer = await input(
          {
            message: `${overwrite ? `\n${overwriteWarningMessage(outputPath)}\n\n` : ""}${actionMessage(action, sourcePath, outputPath)}\n\nType y/yes to continue, n/no to cancel`,
            validate: (value) =>
              parseConfirmation(value) !== undefined || "Enter y/yes or n/no",
          },
          context,
        );

        return parseConfirmation(answer) ?? false;
      }),
    showMessage: async (message) => {
      console.log(message);
    },
  };
}
