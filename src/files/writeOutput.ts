import { writeFile } from 'node:fs/promises'

export async function writeOutput(filePath: string, content: string): Promise<void> {
  await writeFile(filePath, content, 'utf8')
}
