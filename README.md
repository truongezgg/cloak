# Cloak

Cloak is a small terminal tool for protecting text files with a password.

When you run `cloak`, it:

1. asks you to set a password on first run
2. asks for your password on later runs
3. opens a file picker in the current directory
4. automatically decides whether to encode or decode the selected file
5. overwrites the same file after confirmation

Cloak is designed for text-based secrets such as:

- `.env`
- `.env.local`
- `.json`
- `.txt`
- `.pem`
- `.key`

## Features

- First-run password setup
- Password verification on each later run
- Current-directory file picker
- Auto-detect encode vs decode from file header
- Backup file creation before overwrite
- Clean cancel with `Esc` or `q`
- Text-file safety checks to avoid corrupting binary files
- Local config stored in `~/.config/cloak/config.json`

## How it works

### First run

If no password is configured yet:

- Cloak asks for a new password
- Cloak asks you to confirm it
- Cloak stores only password-derived authentication data in:

```txt
~/.config/cloak/config.json
```

After setup, the same run continues directly to file selection.

### Later runs

On later runs:

- Cloak asks for your password
- You get up to 3 attempts
- After 3 wrong attempts, Cloak exits with:

```txt
Too many failed attempts
```

### File selection

After successful authentication:

- Cloak lists files from the current directory only
- It does not recurse into subdirectories
- It rejects files outside the startup directory
- It allows any top-level file, but prioritizes these patterns first:
  - `.env*`
  - `*.json`
  - `*.txt`
  - `*.pem`
  - `*.key`

## Encode / decode behavior

Cloak uses a simple marker on line 1:

```txt
# CLOAK: ENCRYPTED
```

Behavior:

- if line 1 exactly equals `# CLOAK: ENCRYPTED`, Cloak treats the file as encoded and offers to decode it
- otherwise Cloak treats the file as plain text and offers to encode it

Confirmation messages are:

- `This file is plain text. Encode it?`
- `This file is protected by Cloak. Decode it?`

Success messages are:

- `File encoded successfully`
- `File decoded successfully`

## Encoded file format

Encoded files are stored as text.

Line 1:

```txt
# CLOAK: ENCRYPTED
```

Line 2:
- compact JSON payload containing encryption metadata and ciphertext

Example shape:

```json
{"version":1,"alg":"aes-256-gcm","kdf":"scrypt","salt":"...","iv":"...","tag":"...","ciphertext":"..."}
```

## Security details

### Password storage

Cloak does **not** store your raw password.

It stores password-derived authentication data in `config.json` using:

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

- AES-256-GCM for file encryption
- a per-file random salt
- `scrypt` to derive the file encryption key from your password

## Backup behavior

Before Cloak overwrites a file, it creates a backup first.

Default backup name:

```txt
<filename>.cloak.bak
```

Examples:

- `.env` → `.env.cloak.bak`
- `secret.json` → `secret.json.cloak.bak`

If that backup name already exists, Cloak creates a unique backup path instead.

Rules:

1. create backup first
2. write updated file
3. if write succeeds, remove backup
4. if write fails, keep backup

## Text-file restrictions

Cloak is for text files.

It will reject files that look like binary or invalid UTF-8 text instead of trying to encode them.

If a file cannot be safely read as text, Cloak exits with:

```txt
Cannot read file
```

## Exit behavior

You can exit without changing anything by:

- pressing `Esc`
- pressing `q`
- cancelling at file selection
- cancelling at confirmation

If you cancel, Cloak exits cleanly and leaves files unchanged.

## Installation

This project is currently set up as a local Node.js CLI project.

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

### Link as a local CLI command

If you want to run `cloak` directly in your shell:

```bash
npm link
```

Then you can use:

```bash
cloak
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

### Build the project

```bash
npm run build
```

## Usage examples

### Encode a `.env` file

Suppose your current directory contains:

```txt
.env
```

Contents:

```env
API_KEY=abc123
APP_ENV=production
```

Run:

```bash
cloak
```

Then:

- enter password
- select `.env`
- confirm encode

After encoding, the file starts with:

```txt
# CLOAK: ENCRYPTED
```

### Decode an encoded file

Run:

```bash
cloak
```

Then:

- enter password
- select the encoded file
- confirm decode

Cloak restores the original text into the same file.

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

Main areas:

- `src/cli.ts` — CLI entrypoint
- `src/app/runCloak.ts` — main app flow
- `src/config/config.ts` — config load/save
- `src/crypto/password.ts` — password hashing and verification
- `src/crypto/fileCipher.ts` — file encode/decode logic
- `src/files/listFiles.ts` — file listing and ordering
- `src/files/writeWithBackup.ts` — backup + overwrite logic
- `src/ui/prompts.ts` — interactive terminal prompts

## Error messages

Common messages you may see:

- `Wrong password`
- `Too many failed attempts`
- `Passwords do not match`
- `Cannot read file`
- `Cannot write file`
- `Invalid config.json: ...`
- `File is not protected by Cloak`
- `Wrong password` when decoding with the wrong password

## Notes

- Cloak currently works on text files only
- Cloak works in the current directory only
- Cloak does not recurse into subdirectories
- Cloak does not store the raw password
- Cloak overwrites the selected file in place after confirmation

## License

Add a license here if you want to publish or share this project.
