# Cloak

Cloak is a terminal tool for protecting text files with a password.

For people who receive a `.cloak` file and only need to restore the original text, see [DECODE.md](./DECODE.md).

## Installation

### Requirements

- Node.js 20.12 or newer
- npm

### Install with an LLM

If you want an LLM coding agent to do the installation for you, paste this prompt:

```text
Install Cloak for me by following the installation instructions in:
https://raw.githubusercontent.com/truongezgg/cloak/refs/heads/main/README.md

Check the requirements first. Use the GitHub HTTPS install command unless I explicitly ask for SSH or GitHub shorthand. After installation, confirm that the `cloak` command is available.
```

### Install globally from GitHub

Using the GitHub HTTPS URL:

```bash
npm install -g git+https://github.com/truongezgg/cloak.git
```

Using the GitHub SSH URL:

```bash
npm install -g git+ssh://git@github.com/truongezgg/cloak.git
```

Using GitHub shorthand:

```bash
npm install -g github:truongezgg/cloak
```

After install, run:

```bash
cloak
cloak <path>
```

Examples:

```bash
cloak
cloak ./.env
cloak /absolute/path/to/.env.cloak
```

### Update the global install

```bash
npm update -g cloak
```

If npm does not update the GitHub-installed package as expected, reinstall it:

```bash
npm install -g git+https://github.com/truongezgg/cloak.git
```

### Uninstall

```bash
npm uninstall -g cloak
```

### Install for local development

```bash
npm install
```

### Build

```bash
npm run build
```

### Run directly

```bash
node dist/src/cli.js
```

### Link as local CLI command during development

```bash
npm link
```

Then use:

```bash
cloak
cloak <path>
```

## Breaking behavior change

Cloak now writes to a separate destination file instead of overwriting the source file in place.

- Encode: `source` -> `source.cloak`
- Decode: `source.cloak` -> `source`
- Source files remain unchanged for both encode and decode
- Backup-file behavior is removed from the main encode/decode flow

## Usage

For decode instructions and a sample decode test, see [DECODE.md](./DECODE.md).

```bash
cloak
```

- Starts interactive picker mode from the current directory
- Lets you choose a file from the current directory tree (including nested subdirectories)

```bash
cloak <path>
```

- Uses the provided path directly (relative or absolute)
- Skips the file picker
- If the canonical target is outside the startup current directory, Cloak rejects the request and suggests rerunning Cloak from the desired tree instead

Examples:

```bash
cloak ./.env
cloak /absolute/path/to/.env
cloak /absolute/path/to/.env.cloak
```

## Encode / decode rules

Action selection is filename-based:

- Files ending in `.cloak` are decode candidates
- All other files are encode candidates

Decode validation is still strict:

- A `.cloak` file must have line 1 exactly equal to `# CLOAK: ENCRYPTED`
- Otherwise Cloak exits with `File is not protected by Cloak`

## Output naming

Encode output:

- `file` -> `file.cloak`
- `.env` -> `.env.cloak`
- `secret.json` -> `secret.json.cloak`

Decode output:

- `file.cloak` -> `file`
- `.env.cloak` -> `.env`
- `secret.json.cloak` -> `secret.json`

Only the final `.cloak` suffix is removed when decoding.

## Confirmation and overwrite behavior

Before writing output, Cloak asks for confirmation and shows:

- action (`encode` or `decode`)
- source path
- output path

If the destination already exists, Cloak shows an overwrite warning and asks to continue.

If you decline any warning or confirmation, Cloak exits without writing.

## Text-file restrictions

Cloak is for text files.

If a selected/direct-path file cannot be safely read as text (including directories, missing paths, non-text or invalid UTF-8 inputs), Cloak exits with:

```txt
Cannot read file
```

## Local password state

Cloak reads a `.cloak` file from the directory where the command was started. The file stores a single line of the form `PASSWORD=...` in plain text so each working tree keeps its credential data locally.

- On startup, Cloak scans `.cloak` for the first valid `PASSWORD=...` line and uses that value.
- Lines that do not begin with `PASSWORD=` are ignored, and empty `PASSWORD=` values are treated as invalid.
- If no valid password entry exists (or the file is missing), Cloak prompts once for a password and rewrites `.cloak` with `PASSWORD=<your input>`.
- `.cloak` itself is reserved for local password state and is never offered as an encode or decode target.

## Path restrictions

- Cloak only allows targets that live within the directory tree where the command was launched; files inside nested subdirectories are permitted.
- If a resolved target would fall outside that startup tree, Cloak rejects the request and suggests changing into the desired tree before running Cloak again.

## Development

### Start in development mode

```bash
npm run dev
```

### Run tests

```bash
npm test
```

### Build

```bash
npm run build
```

## Project structure

```txt
src/
  app/
  config/
  crypto/
  files/
  ui/
tests/
```

Main files:

- `src/cli.ts` — CLI entrypoint
- `src/app/runCloak.ts` — main app flow
- `src/files/resolveTarget.ts` — path/action/output resolution
- `src/files/writeOutput.ts` — output-file writer
- `src/files/listFiles.ts` — picker file listing
- `src/crypto/fileCipher.ts` — encode/decode logic
- `src/ui/prompts.ts` — interactive prompts

## Common messages

- `Wrong password`
- `Too many failed attempts`
- `Passwords do not match`
- `Cannot read file`
- `Cannot write file`
- `File is not protected by Cloak`

## License

Add a license here if you want to publish or share this project.
