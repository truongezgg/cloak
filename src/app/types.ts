export type ActionKind = 'encode' | 'decode'

export type PromptContext = {
  rootDir: string
  configPath: string
  configFound: boolean
}

export type PromptPort = {
  askLocalPassword(context: PromptContext): Promise<string>
  selectFile(files: { name: string; path: string }[], context: PromptContext): Promise<string>
  confirmAction(
    action: ActionKind,
    sourcePath: string,
    outputPath: string,
    overwrite: boolean,
    context: PromptContext,
  ): Promise<boolean>
  showMessage(message: string): Promise<void>
}

export type RunCloakOptions = {
  cwd?: string
  prompts?: PromptPort
  directPath?: string
  resolveTargetPath?: (
    rootDir: string,
    inputPath: string,
  ) => Promise<{
    sourcePath: string
    outputPath: string
    action: ActionKind
    outsideRoot: boolean
    isWorkspacePasswordFile: boolean
  }>
  writeOutput?: (filePath: string, content: string) => Promise<void>
}
