import fs from 'node:fs';
import path from 'node:path';

export interface ClearableHistoryStore {
    path: string;
    set(key: 'items', value: unknown[]): void;
}

export function getHistoryBackupPath(storePath: string): string {
    return path.join(path.dirname(storePath), `${path.parse(storePath).name}.bak.json`);
}

export function clearHistoryStore(store: ClearableHistoryStore): void {
    store.set('items', []);

    const backupPath = getHistoryBackupPath(store.path);
    if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
    }
}
