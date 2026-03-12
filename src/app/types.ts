export type PasswordRecord = {
  passwordHash: string
  salt: string
  kdf: {
    name: 'argon2id'
    memoryCost: number
    timeCost: number
    parallelism: number
    hashLength: number
    saltLength: number
  }
}

export type ActionKind = 'encode' | 'decode'

export type PromptPort = {
  askNewPassword(): Promise<string>
  askConfirmPassword(): Promise<string>
  askPassword(): Promise<string>
  selectFile(files: { name: string; path: string }[]): Promise<string>
  confirmOutsideRoot(path: string): Promise<boolean>
  confirmAction(action: ActionKind, sourcePath: string, outputPath: string, overwrite: boolean): Promise<boolean>
  showMessage(message: string): Promise<void>
}

export type RunCloakOptions = {
  cwd?: string
  configDir?: string
  prompts?: PromptPort
  directPath?: string
  resolveTargetPath?: (
    rootDir: string,
    inputPath: string,
  ) => Promise<{ sourcePath: string; outputPath: string; action: ActionKind; outsideRoot: boolean }>
  writeOutput?: (filePath: string, content: string) => Promise<void>
}
