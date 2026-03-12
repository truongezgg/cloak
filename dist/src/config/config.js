import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
function isValidKdf(value) {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const entry = value;
    return (entry.name === 'argon2id' &&
        typeof entry.memoryCost === 'number' &&
        typeof entry.timeCost === 'number' &&
        typeof entry.parallelism === 'number' &&
        typeof entry.hashLength === 'number' &&
        typeof entry.saltLength === 'number');
}
function validateConfig(parsed) {
    return (typeof parsed.passwordHash === 'string' &&
        typeof parsed.salt === 'string' &&
        isValidKdf(parsed.kdf));
}
export async function loadConfig(configDir) {
    const filePath = join(configDir, 'config.json');
    try {
        const raw = await readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            throw new Error('Invalid config.json: expected an object');
        }
        if (!Object.prototype.hasOwnProperty.call(parsed, 'passwordHash')) {
            return null;
        }
        if (typeof parsed.passwordHash !== 'string' || parsed.passwordHash.length === 0) {
            throw new Error('Invalid config.json: passwordHash must be a non-empty string');
        }
        if (!validateConfig(parsed)) {
            throw new Error('Invalid config.json: missing required fields');
        }
        return parsed;
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }
        if (error instanceof SyntaxError) {
            throw new Error('Invalid config.json: malformed JSON');
        }
        throw error;
    }
}
export async function saveConfig(configDir, config) {
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, 'config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}
