import { writeFile } from 'node:fs/promises';
export async function writeOutput(filePath, content) {
    await writeFile(filePath, content, 'utf8');
}
