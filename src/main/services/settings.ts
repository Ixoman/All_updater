import Store from 'electron-store';
import fs from 'node:fs';
import path from 'node:path';

export interface UserSettings {
    theme: 'dark' | 'light' | 'system';
    language: 'en' | 'es';
    fontSize: 'small' | 'medium' | 'large';
    hasSeenOnboarding: boolean;
}

const schema = {
    theme: {
        type: 'string',
        enum: ['dark', 'light', 'system'],
        default: 'system'
    },
    language: {
        type: 'string',
        enum: ['en', 'es'],
        default: 'en'
    },
    fontSize: {
        type: 'string',
        enum: ['small', 'medium', 'large'],
        default: 'medium'
    },
    hasSeenOnboarding: {
        type: 'boolean',
        default: false
    }
} as const;

export class SettingsService {
    private store: Store<UserSettings>;

    constructor() {
        this.store = new Store<UserSettings>({
            schema,
            clearInvalidConfig: true
        });
        console.log('Settings file path:', this.store.path);
    }

    get<K extends keyof UserSettings>(key: K): UserSettings[K] {
        return this.store.get(key);
    }

    private backupStoreFile(): void {
        try {
            const sourcePath = this.store.path;
            if (!fs.existsSync(sourcePath)) return;
            const backupPath = path.join(path.dirname(sourcePath), `${path.parse(sourcePath).name}.bak.json`);
            fs.copyFileSync(sourcePath, backupPath);
        } catch (error) {
            console.error('[SettingsService] Failed to backup settings file:', error);
        }
    }

    set<K extends keyof UserSettings>(key: K, value: UserSettings[K]): void {
        this.backupStoreFile();
        this.store.set(key, value);
    }
}
