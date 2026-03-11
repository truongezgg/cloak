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
  confirmAction(action: ActionKind): Promise<boolean>
  showMessage(message: string): Promise<void>
}
