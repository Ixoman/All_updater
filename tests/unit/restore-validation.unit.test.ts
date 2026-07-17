import assert from 'node:assert/strict';
import {
  isValidRestoreSequence,
  parseRestoreSequence,
  validateRestoreVerificationInput
} from '../../src/main/restore-validation.js';

export async function run() {
  assert.equal(parseRestoreSequence(''), null);
  assert.equal(parseRestoreSequence('   '), null);
  assert.equal(parseRestoreSequence('0'), null);
  assert.equal(parseRestoreSequence('-1'), null);
  assert.equal(parseRestoreSequence('42'), 42);
  assert.equal(isValidRestoreSequence(42), true);
  assert.equal(isValidRestoreSequence('42'), false);

  assert.deepEqual(
    validateRestoreVerificationInput(42, 'All Updater Auto-Restore'),
    { sequenceNumber: 42, description: 'All Updater Auto-Restore' }
  );
  assert.throws(
    () => validateRestoreVerificationInput('0; Write-Output injected; #', 'restore'),
    /Invalid restore point sequence number/
  );
  assert.throws(
    () => validateRestoreVerificationInput(42, 'restore\nforged-log'),
    /Invalid restore point description/
  );
}
