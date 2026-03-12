# How to decode a Cloak file

This guide is for people who receive a file ending in `.cloak` and need to turn it back into plain text.

## What you need

- The encoded file, for example `secret.txt.cloak`
- The correct password used when the file was encoded

If you want to decode inside your own Node.js or TypeScript code, you do not need the `cloak` CLI. See the programmatic example below.

## Important behavior

- Cloak decides to decode based on the filename ending in `.cloak`
- The encoded source file is not modified
- Decoding writes a separate output file with the final `.cloak` suffix removed

Examples:

- `secret.txt.cloak` -> `secret.txt`
- `.env.cloak` -> `.env`
- `notes.cloak` -> `notes`

## Decode in Node.js / TypeScript without the CLI

This repo includes a self-contained sample file that shows how to encode and decode text directly in code:

- sample file: `examples/programmatic-decode.ts`

The sample does not import from the Cloak source tree. It contains the full encode/decode logic in one file so you can copy it into your own project more easily.

Run it from the project root:

```bash
npx tsx examples/programmatic-decode.ts
```

The sample prints:

1. the original text
2. the encoded Cloak payload
3. the decoded text

Use this approach if you want to implement Cloak decoding inside your own Node.js app instead of calling the `cloak` CLI.

## Try the sample file in this repo

This repo includes a committed sample encoded file:

- encoded file: `examples/sample.txt.cloak`
- expected decoded output: `examples/sample.txt`
- sample password: `demo123`

From the project root, create a local password file:

```bash
cat > .cloak <<'EOF'
PASSWORD=demo123
EOF
```

Then run:

```bash
cloak ./examples/sample.txt.cloak
```

After you confirm the action, Cloak writes `examples/sample.txt`.

## Password setup

Cloak reads the password from a local `.cloak` file in the directory where you start the command.

That file must contain:

```txt
PASSWORD=your-password-here
```

Notes:

- If the `.cloak` file is missing or does not contain a valid `PASSWORD=...` entry, Cloak will prompt you for the password
- After you enter it, Cloak rewrites the local `.cloak` file with that password
- The `.cloak` file stores the password in plain text, so do not commit or share it casually

## Decode a file directly

From the directory tree where you want to work:

```bash
cloak ./path/to/secret.txt.cloak
```

You can also use an absolute path:

```bash
cloak /absolute/path/to/secret.txt.cloak
```

Cloak will:

1. Detect that the file should be decoded
2. Show the source path and output path
3. Ask for confirmation before writing
4. Write the decoded file as `secret.txt`

## Decode through the file picker

Run:

```bash
cloak
```

Then select the `.cloak` file from the interactive picker.

## Path rules

Cloak only allows files inside the directory tree where the command starts.

If the target file resolves outside that tree, Cloak rejects it. In that case, change into the correct directory and run `cloak` again from there.

## Overwrite behavior

If the decoded output file already exists, Cloak shows an overwrite warning before writing anything.

If you decline the confirmation, Cloak exits without changing files.

## Common errors

### `Wrong password`

The password in your local `.cloak` file does not match the password used to encode the file.

Fix by updating the local `.cloak` file or rerunning `cloak` and entering the correct password when prompted.

### `File is not protected by Cloak`

The file ends with `.cloak` but does not contain a valid Cloak header and payload.

This usually means the file was not encoded by Cloak, or it was modified or corrupted.

### `Cannot read file`

Cloak could not safely read the file as text, or the path is invalid.

### `Cannot write file`

Cloak could not write the decoded output file.

## Sharing a file with someone else

If you send someone a `.cloak` file, they also need:

- the `cloak` CLI
- the correct password
- a safe way to receive that password separately from the file

A good workflow is:

1. Share the `.cloak` file
2. Share the password through a separate secure channel
3. Ask the recipient to create a local `.cloak` file with `PASSWORD=...`
4. Have them run `cloak path/to/file.cloak`
