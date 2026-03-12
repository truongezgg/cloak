import { stdin } from "node:process";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@inquirer/prompts", () => ({
  input: vi.fn(),
  password: vi.fn(),
  select: vi.fn(),
}));

import { input, password } from "@inquirer/prompts";
import type { PromptContext } from "../src/app/types.js";
import {
  actionMessage,
  createPromptPort,
  outsideRootMessage,
  overwriteWarningMessage,
} from "../src/ui/prompts.js";

const missingConfigContext: PromptContext = {
  rootDir: "/tmp/workspace",
  configPath: "/tmp/workspace/.cloak",
  configFound: false,
};

const foundConfigContext: PromptContext = {
  rootDir: "/tmp/workspace",
  configPath: "/tmp/workspace/.cloak",
  configFound: true,
};

beforeEach(() => {
  vi.mocked(password).mockReset();
  vi.mocked(input).mockReset();
});

it("formats the encode confirmation with source and output", () => {
  expect(actionMessage("encode", ".env", ".env.cloak")).toContain(
    "Encode this file?",
  );
  expect(actionMessage("encode", ".env", ".env.cloak")).toContain(
    "  Source: .env",
  );
  expect(actionMessage("encode", ".env", ".env.cloak")).toContain(
    "  Output: .env.cloak",
  );
});

it("formats the decode overwrite warning", () => {
  expect(overwriteWarningMessage(".env")).toContain(
    "⚠️ WARNING: destination file already exists",
  );
  expect(overwriteWarningMessage(".env")).toContain("  Target: .env");
  expect(overwriteWarningMessage(".env")).not.toContain("Continue?");
});

it("formats the outside-root warning", () => {
  expect(outsideRootMessage("/tmp/.env")).toBe(
    'File is outside the current directory\nRun Cloak from that directory instead:\ncd "/tmp" && cloak',
  );
});

it("quotes outside-root guidance for shell-sensitive paths", () => {
  expect(outsideRootMessage('/tmp/a b"c\\d$e`f/.env')).toBe(
    'File is outside the current directory\nRun Cloak from that directory instead:\ncd "/tmp/a b\\"c\\\\d\\$e\\`f" && cloak',
  );
});

it("includes overwrite warning and action details in confirmation message", async () => {
  vi.mocked(input).mockResolvedValue("Yes");

  const prompts = createPromptPort();
  await prompts.confirmAction(
    "decode",
    "/tmp/source.cloak",
    "/tmp/source",
    true,
    foundConfigContext,
  );

  expect(vi.mocked(input)).toHaveBeenCalledTimes(1);
  const promptConfig = vi.mocked(input).mock.calls[0]?.[0];
  const message = promptConfig?.message ?? "";
  expect(message).not.toContain("Esc/q to exit");
  expect(message).not.toContain("⚙️ : /tmp/workspace/.cloak");
  expect(message).not.toContain("📁: /tmp/workspace");
  expect(message).toContain("\n⚠️ WARNING: destination file already exists");
  expect(message).toContain("This will replace the existing file.");
  expect(message).toContain("\n\nDecode this file?");
  expect(message).toContain("  Source: /tmp/source.cloak");
  expect(message).toContain("  Output: /tmp/source");
  expect(message).toContain("Type y/yes to continue, n/no to cancel");
  expect(promptConfig?.validate?.("y")).toBe(true);
  expect(promptConfig?.validate?.("Yes")).toBe(true);
  expect(promptConfig?.validate?.("N")).toBe(true);
  expect(promptConfig?.validate?.("random")).toBe("Enter y/yes or n/no");
});

it("accepts yes in any casing for confirmation", async () => {
  vi.mocked(input).mockResolvedValue("YES");

  const prompts = createPromptPort();

  await expect(
    prompts.confirmAction(
      "encode",
      ".env",
      ".env.cloak",
      false,
      foundConfigContext,
    ),
  ).resolves.toBe(true);
});

it("returns false for no confirmation input", async () => {
  vi.mocked(input).mockResolvedValue("No");

  const prompts = createPromptPort();

  await expect(
    prompts.confirmAction(
      "encode",
      ".env",
      ".env.cloak",
      false,
      foundConfigContext,
    ),
  ).resolves.toBe(false);
});

it("shows create-password message when config is missing", async () => {
  vi.mocked(password).mockResolvedValue("secret123");

  const prompts = createPromptPort();
  await prompts.askLocalPassword(missingConfigContext);

  expect(vi.mocked(password)).toHaveBeenCalledTimes(1);
  const message = vi.mocked(password).mock.calls[0]?.[0]?.message ?? "";
  expect(message).toContain("Esc/q to exit");
  expect(message).toContain("⚙️ : not found (/tmp/workspace/.cloak)");
  expect(message).toContain("📁: /tmp/workspace");
  expect(message).toContain("Create password for .cloak");
});

it("shows enter-password message when config exists", async () => {
  vi.mocked(password).mockResolvedValue("secret123");

  const prompts = createPromptPort();
  await prompts.askLocalPassword(foundConfigContext);

  expect(vi.mocked(password)).toHaveBeenCalledTimes(1);
  const message = vi.mocked(password).mock.calls[0]?.[0]?.message ?? "";
  expect(message).toContain("Enter password for .cloak");
});

it("cancels password prompt when q is pressed", async () => {
  vi.mocked(password).mockImplementation(
    (_config, context) =>
      new Promise((_resolve, reject) => {
        context?.signal?.addEventListener(
          "abort",
          () => reject(new Error("Aborted")),
          { once: true },
        );
      }),
  );

  const prompts = createPromptPort();
  const pending = prompts.askLocalPassword(missingConfigContext);

  stdin.emit("keypress", "q", { name: "q", ctrl: false, meta: false });

  await expect(pending).rejects.toThrow("User cancelled");
  const message = vi.mocked(password).mock.calls[0]?.[0]?.message ?? "";
  expect(message).toContain("Esc/q to exit");
});

it("cancels password prompt when Escape is pressed", async () => {
  vi.mocked(password).mockImplementation(
    (_config, context) =>
      new Promise((_resolve, reject) => {
        context?.signal?.addEventListener(
          "abort",
          () => reject(new Error("Aborted")),
          { once: true },
        );
      }),
  );

  const prompts = createPromptPort();
  const pending = prompts.askLocalPassword(missingConfigContext);

  stdin.emit("keypress", "\u001B", { name: "escape" });

  await expect(pending).rejects.toThrow("User cancelled");
});
