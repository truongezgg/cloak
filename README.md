# Cloak

Cloak is a terminal tool for protecting text files with a password.

## Breaking behavior change

Cloak now writes to a separate destination file instead of overwriting the source file in place.

- Encode: `source` -> `source.cloak`
- Decode: `source.cloak` -> `source`
- Source files remain unchanged for both encode and decode
- Backup-file behavior is removed from the main encode/decode flow

## Usage

```bash
cloak
```

- Starts interactive picker mode from the current directory
- Lets you choose a file from the top level of the current directory

```bash
cloak <path>
```

- Uses the provided path directly (relative or absolute)
- Skips the file picker
- If the canonical target is outside the startup current directory, Cloak shows a warning and asks to continue

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

## Authentication flow

On first run:

1. Cloak asks for a new password
2. Cloak asks for confirmation
3. Cloak stores password-derived authentication data in:

```txt
~/.config/cloak/config.json
```

On later runs:

- Cloak asks for your password
- You get up to 3 attempts
- After 3 failed attempts, it exits with `Too many failed attempts`

Cloak does not store the raw password.

## Security details

### Password storage

`config.json` stores password-derived authentication data using:

- Argon2id
- random salt per password record
- minimum settings:
  - memory cost: 64 MiB
  - time cost: 3
  - parallelism: 1
  - salt length: 16 bytes
  - hash length: 32 bytes

### File encryption

Cloak encrypts file contents using:

- AES-256-GCM
- per-file random salt
- `scrypt` key derivation from your password

Encoded files are stored as text with:

- line 1 marker: `# CLOAK: ENCRYPTED`
- line 2 compact JSON payload containing metadata and ciphertext

## Installation

### Requirements

- Node.js
- npm

### Install dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

### Run directly

```bash
node dist/cli.js
```

### Link as local CLI command

```bash
npm link
```

Then use:

```bash
cloak
cloak <path>
```

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
- `Invalid config.json: ...`
- `File is not protected by Cloak`

## License

Add a license here if you want to publish or share this project.
