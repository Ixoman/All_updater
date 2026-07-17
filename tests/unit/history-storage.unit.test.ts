import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { clearHistoryStore, getHistoryBackupPath } from '../../src/main/history-storage.js';

export async function run() {
  const tempFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'all-updater-history-test-'));
  try {
    const storePath = path.join(tempFolder, 'installation-history.json');
    const backupPath = getHistoryBackupPath(storePath);
    fs.writeFileSync(storePath, '{"items":[{"id":"Example.App"}]}', 'utf8');
    fs.writeFileSync(backupPath, '{"items":[{"id":"Example.App"}]}', 'utf8');

    let clearedValue: unknown[] | null = null;
    clearHistoryStore({
      path: storePath,
      set(key, value) {
        assert.equal(key, 'items');
        clearedValue = value;
      }
    });

    assert.deepEqual(clearedValue, []);
    assert.equal(fs.existsSync(backupPath), false);
  } finally {
    fs.rmSync(tempFolder, { recursive: true, force: true });
  }
}
