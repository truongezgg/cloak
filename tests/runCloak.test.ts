import {
  access,
  mkdtemp,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { runCloak } from "../src/app/runCloak.js";
import { runCli } from "../src/cli.js";
import { encodeTextFile } from "../src/crypto/fileCipher.js";
import { outsideRootMessage } from "../src/ui/prompts.js";

async function saveWorkspacePassword(
  root: string,
  password = "secret123",
): Promise<void> {
  await writeFile(join(root, ".cloak"), `PASSWORD=${password}\n`, "utf8");
}

function createPrompts(
  overrides: Partial<ReturnType<typeof basePrompts>> = {},
) {
  return { ...basePrompts(), ...overrides };
}

async function expectedPromptContext(root: string, configFound: boolean) {
  const canonicalRoot = await realpath(root);
  return {
    rootDir: canonicalRoot,
    configPath: join(canonicalRoot, ".cloak"),
    configFound,
  };
}

function basePrompts() {
  return {
    askLocalPassword: vi.fn().mockResolvedValue("secret123"),
    selectFile: vi.fn(),
    confirmAction: vi.fn().mockResolvedValue(true),
    showMessage: vi.fn().mockResolvedValue(undefined),
  };
}

it("prints version for -v", async () => {
  const lines: string[] = [];

  await expect(
    runCli(["node", "cloak", "-v"], (line) => lines.push(line)),
  ).resolves.toBeUndefined();

  expect(lines).toEqual(["0.1.4"]);
});

it("prints version for --version", async () => {
  const lines: string[] = [];

  await expect(
    runCli(["node", "cloak", "--version"], (line) => lines.push(line)),
  ).resolves.toBeUndefined();

  expect(lines).toEqual(["0.1.4"]);
});

it("prompts for local password on first run, rewrites .cloak, and encodes selected file", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloak-app-"));
  const filePath = join(root, ".env");
  await writeFile(filePath, "HELLO=world\n", "utf8");

  const prompts = createPrompts({
    selectFile: vi.fn().mockResolvedValue(filePath),
  });

  await runCloak({ cwd: root, prompts });

  const canonicalPath = await realpath(filePath);
  const outputPath = `${canonicalPath}.cloak`;
  const missingContext = await expectedPromptContext(root, false);
  const foundContext = await expectedPromptContext(root, true);
  expect(await readFile(join(root, ".cloak"), "utf8")).toBe(
    "PASSWORD=secret123\n",
  );
  expect(prompts.askLocalPassword).toHaveBeenCalledTimes(1);
  expect(prompts.askLocalPassword).toHaveBeenCalledWith(missingContext);
  expect(prompts.selectFile).toHaveBeenCalledWith(
    [{ name: ".env", path: canonicalPath }],
    foundContext,
  );
  expect(prompts.confirmAction).toHaveBeenCalledWith(
    "encode",
    canonicalPath,
    outputPath,
    false,
    foundContext,
  );
  expect(prompts.showMessage).toHaveBeenCalledWith("File encoded successfully");
});

it("uses existing local password without prompting", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloak-app-"));
  const filePath = join(root, ".env");
  await writeFile(filePath, "HELLO=world\n", "utf8");
  await saveWorkspacePassword(root);

  const prompts = createPrompts({
    selectFile: vi.fn().mockResolvedValue(filePath),
  });

  await runCloak({ cwd: root, prompts });

  const foundContext = await expectedPromptContext(root, true);
  expect(prompts.askLocalPassword).not.toHaveBeenCalled();
  expect(prompts.selectFile).toHaveBeenCalledWith(
    [{ name: ".env", path: await realpath(filePath) }],
    foundContext,
  );
});

it("re-prompts when .cloak is invalid and rewrites it immediately", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloak-app-"));
  const filePath = join(root, ".env");
  await writeFile(filePath, "HELLO=world\n", "utf8");
  await writeFile(join(root, ".cloak"), "NO_PASSWORD_KEY=1\n", "utf8");

  const prompts = createPrompts({
    selectFile: vi.fn().mockResolvedValue(filePath),
  });

  await runCloak({ cwd: root, prompts });

  const missingContext = await expectedPromptContext(root, false);
  const foundContext = await expectedPromptContext(root, true);
  expect(prompts.askLocalPassword).toHaveBeenCalledTimes(1);
  expect(prompts.askLocalPassword).toHaveBeenCalledWith(missingContext);
  expect(prompts.selectFile).toHaveBeenCalledWith(
    [{ name: ".env", path: await realpath(filePath) }],
    foundContext,
  );
  expect(await readFile(join(root, ".cloak"), "utf8")).toBe(
    "PASSWORD=secret123\n",
  );
});

it("uses the picker when no direct path is provided", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloak-app-"));
  const filePath = join(root, ".env");
  await writeFile(filePath, "HELLO=world\n", "utf8");
  await saveWorkspacePassword(root);

  const prompts = createPrompts({
    selectFile: vi.fn().mockResolvedValue(filePath),
  });

  await runCloak({ cwd: root, prompts });

  const foundContext = await expectedPromptContext(root, true);
  expect(prompts.selectFile).toHaveBeenCalledWith(
    [{ name: ".env", path: await realpath(filePath) }],
    foundContext,
  );
});

it("uses the provided direct path and skips file selection", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloak-app-"));
  const filePath = join(root, ".env");
  await writeFile(filePath, "HELLO=world\n", "utf8");
  await saveWorkspacePassword(root);

  const prompts = createPrompts();

  await runCloak({ cwd: root, prompts, directPath: "./.env" });

  const foundContext = await expectedPromptContext(root, true);
  const canonicalPath = await realpath(filePath);
  const outputPath = `${canonicalPath}.cloak`;
  expect(prompts.selectFile).not.toHaveBeenCalled();
  expect(prompts.confirmAction).toHaveBeenCalledWith(
    "encode",
    canonicalPath,
    outputPath,
    false,
    foundContext,
  );
});

it("exits cleanly when local password prompt is cancelled", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloak-app-"));
  const filePath = join(root, ".env");
  await writeFile(filePath, "HELLO=world\n", "utf8");

  const prompts = createPrompts({
    askLocalPassword: vi.fn().mockRejectedValue(new Error("User cancelled")),
  });

  await expect(
    runCloak({ cwd: root, prompts, directPath: filePath }),
  ).resolves.toBeUndefined();
  expect(prompts.selectFile).not.toHaveBeenCalled();
  expect(prompts.confirmAction).not.toHaveBeenCalled();
});

it("exits cleanly when file selection is cancelled", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloak-app-"));
  const filePath = join(root, ".env");
  await writeFile(filePath, "HELLO=world\n", "utf8");
  await saveWorkspacePassword(root);

  const prompts = createPrompts({
    selectFile: vi.fn().mockRejectedValue(new Error("User cancelled")),
  });

  const before = await readFile(filePath, "utf8");
  await expect(runCloak({ cwd: root, prompts })).resolves.toBeUndefined();
  expect(prompts.confirmAction).not.toHaveBeenCalled();
  await expect(readFile(filePath, "utf8")).resolves.toBe(before);
});

it("propagates non-cancel selectFile failures and does not confirm", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloak-app-"));
  const filePath = join(root, ".env");
  await writeFile(filePath, "HELLO=world\n", "utf8");
  await saveWorkspacePassword(root);

  const prompts = createPrompts({
    selectFile: vi.fn().mockRejectedValue(new Error("picker failed")),
  });

  await expect(runCloak({ cwd: root, prompts })).rejects.toThrow(
    "picker failed",
  );
  expect(prompts.confirmAction).not.toHaveBeenCalled();
  expect(prompts.showMessage).not.toHaveBeenCalledWith("Cannot read file");
});

it("rejects outside-root targets with message and no confirmation prompt", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloak-app-"));
  const outside = await mkdtemp(join(tmpdir(), "cloak-app-outside-"));
  const filePath = join(outside, ".env");
  await writeFile(filePath, "HELLO=world\n", "utf8");
  await saveWorkspacePassword(root);

  const prompts = createPrompts();
  const canonicalOutside = await realpath(filePath);

  await expect(
    runCloak({ cwd: root, prompts, directPath: filePath }),
  ).rejects.toThrow("File is outside the current directory");
  expect(prompts.showMessage).toHaveBeenCalledWith(
    outsideRootMessage(canonicalOutside),
  );
  expect(prompts.confirmAction).not.toHaveBeenCalled();
});

it("rejects reserved .cloak target before reading file contents", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloak-app-"));
  await saveWorkspacePassword(root);

  const prompts = createPrompts();

  await expect(
    runCloak({ cwd: root, prompts, directPath: "./.cloak" }),
  ).rejects.toThrow("Cannot read file");
  expect(prompts.showMessage).toHaveBeenCalledWith("Cannot read file");
  expect(prompts.confirmAction).not.toHaveBeenCalled();
});

it("uses decode flow for .cloak files and reports decode success", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloak-app-"));
  const filePath = join(root, ".env.cloak");
  await saveWorkspacePassword(root);
  await writeFile(
    filePath,
    await encodeTextFile("HELLO=world\n", "secret123"),
    "utf8",
  );

  const prompts = createPrompts({
    selectFile: vi.fn().mockResolvedValue(filePath),
  });

  await runCloak({ cwd: root, prompts });

  const canonicalPath = await realpath(filePath);
  const outputPath = canonicalPath.slice(0, -".cloak".length);
  const foundContext = await expectedPromptContext(root, true);
  await expect(readFile(filePath, "utf8")).resolves.toContain(
    "# CLOAK: ENCRYPTED\n",
  );
  await expect(readFile(outputPath, "utf8")).resolves.toBe("HELLO=world\n");
  expect(prompts.confirmAction).toHaveBeenCalledWith(
    "decode",
    canonicalPath,
    outputPath,
    false,
    foundContext,
  );
  expect(prompts.showMessage).toHaveBeenCalledWith("File decoded successfully");
});

it("fails decode after confirmation with wrong password and does not write output", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloak-app-"));
  const filePath = join(root, ".env.cloak");
  await saveWorkspacePassword(root, "secret123");
  await writeFile(
    filePath,
    await encodeTextFile("HELLO=world\n", "different-password"),
    "utf8",
  );

  const prompts = createPrompts({
    selectFile: vi.fn().mockResolvedValue(filePath),
  });
  const writer = vi.fn().mockResolvedValue(undefined);

  await expect(
    runCloak({ cwd: root, prompts, writeOutput: writer }),
  ).rejects.toThrow();
  expect(prompts.confirmAction).toHaveBeenCalledTimes(1);
  expect(writer).not.toHaveBeenCalled();
  await expect(access(join(root, ".env"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

it("shows overwrite warning when encode destination already exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloak-app-"));
  const sourcePath = join(root, ".env");
  const existingOutput = join(root, ".env.cloak");
  await saveWorkspacePassword(root);
  await writeFile(sourcePath, "HELLO=world\n", "utf8");
  await writeFile(existingOutput, "old encrypted payload\n", "utf8");

  const prompts = createPrompts({
    selectFile: vi.fn().mockResolvedValue(sourcePath),
  });

  await runCloak({ cwd: root, prompts });

  const canonicalSource = await realpath(sourcePath);
  const outputPath = `${canonicalSource}.cloak`;
  const foundContext = await expectedPromptContext(root, true);
  expect(prompts.confirmAction).toHaveBeenCalledWith(
    "encode",
    canonicalSource,
    outputPath,
    true,
    foundContext,
  );
});

it("does not write when the user declines the overwrite warning", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloak-app-"));
  const sourcePath = join(root, ".env");
  const outputPath = join(root, ".env.cloak");
  const existingDestination = "existing encrypted payload\n";
  await saveWorkspacePassword(root);
  await writeFile(sourcePath, "HELLO=world\n", "utf8");
  await writeFile(outputPath, existingDestination, "utf8");

  const prompts = createPrompts({
    selectFile: vi.fn().mockResolvedValue(sourcePath),
    confirmAction: vi.fn().mockResolvedValue(false),
  });

  await expect(runCloak({ cwd: root, prompts })).resolves.toBeUndefined();
  await expect(readFile(outputPath, "utf8")).resolves.toBe(existingDestination);
});

it("rejects .cloak input when marker is missing on first line", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloak-app-"));
  const filePath = join(root, "bad.cloak");
  const outputPath = join(root, "bad");
  await saveWorkspacePassword(root);
  await writeFile(filePath, "not cloak\n# CLOAK: ENCRYPTED\n{}\n", "utf8");

  const prompts = createPrompts({
    selectFile: vi.fn().mockResolvedValue(filePath),
  });

  await expect(runCloak({ cwd: root, prompts })).rejects.toThrow(
    "File is not protected by Cloak",
  );
  expect(prompts.confirmAction).not.toHaveBeenCalled();
  await expect(access(outputPath)).rejects.toMatchObject({ code: "ENOENT" });
});

it("exits cleanly when confirmation prompt is cancelled", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloak-app-"));
  const filePath = join(root, ".env");
  await saveWorkspacePassword(root);
  await writeFile(filePath, "HELLO=world\n", "utf8");

  const prompts = createPrompts({
    selectFile: vi.fn().mockResolvedValue(filePath),
    confirmAction: vi.fn().mockRejectedValue(new Error("User cancelled")),
  });

  const before = await readFile(filePath, "utf8");
  await expect(runCloak({ cwd: root, prompts })).resolves.toBeUndefined();
  await expect(readFile(filePath, "utf8")).resolves.toBe(before);
});

it("shows read failure and throws when direct path does not exist", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloak-app-"));
  await saveWorkspacePassword(root);

  const prompts = createPrompts();

  await expect(
    runCloak({ cwd: root, prompts, directPath: "./missing.env" }),
  ).rejects.toThrow("Cannot read file");
  expect(prompts.showMessage).toHaveBeenCalledWith("Cannot read file");
  expect(prompts.selectFile).not.toHaveBeenCalled();
  expect(prompts.confirmAction).not.toHaveBeenCalled();
});

it("shows read failure and throws when selected file is not valid UTF-8 text", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloak-app-"));
  const filePath = join(root, "binary.bin");
  await saveWorkspacePassword(root);
  await writeFile(filePath, Buffer.from([0xff, 0xfe, 0xfd]));

  const prompts = createPrompts({
    selectFile: vi.fn().mockResolvedValue(filePath),
  });

  await expect(runCloak({ cwd: root, prompts })).rejects.toThrow(
    "Cannot read file",
  );
  expect(prompts.showMessage).toHaveBeenCalledWith("Cannot read file");
  expect(prompts.confirmAction).not.toHaveBeenCalled();
});

it("aborts before writing when outputPath equals sourcePath", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloak-app-"));
  const sourcePath = join(root, ".env");
  const original = "SAFE=1\n";
  await saveWorkspacePassword(root);
  await writeFile(sourcePath, original, "utf8");

  const prompts = createPrompts({
    selectFile: vi.fn().mockResolvedValue(sourcePath),
  });
  const writer = vi.fn().mockResolvedValue(undefined);

  await expect(
    runCloak({
      cwd: root,
      prompts,
      resolveTargetPath: async () => ({
        sourcePath,
        outputPath: sourcePath,
        action: "encode",
        outsideRoot: false,
        isWorkspacePasswordFile: false,
      }),
      writeOutput: writer,
    }),
  ).rejects.toThrow("Cannot write file");

  expect(writer).not.toHaveBeenCalled();
  expect(prompts.showMessage).toHaveBeenCalledWith("Cannot write file");
  expect(await readFile(sourcePath, "utf8")).toBe(original);
});

it("shows Cannot write file when writing fails and leaves source unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloak-app-"));
  const sourcePath = join(root, ".env");
  const outputPath = `${sourcePath}.cloak`;
  const original = "API_KEY=abc123\n";
  await saveWorkspacePassword(root);
  await writeFile(sourcePath, original, "utf8");

  const prompts = createPrompts({
    selectFile: vi.fn().mockResolvedValue(sourcePath),
  });
  const writer = vi.fn().mockRejectedValue(new Error("disk full"));

  await expect(
    runCloak({ cwd: root, prompts, writeOutput: writer }),
  ).rejects.toThrow("Cannot write file");
  expect(await readFile(sourcePath, "utf8")).toBe(original);
  await expect(access(outputPath)).rejects.toMatchObject({ code: "ENOENT" });
  expect(prompts.showMessage).toHaveBeenCalledWith("Cannot write file");
});
