import assert from 'node:assert/strict';
import {
  buildWingetForceInstallArgs,
  buildWingetUpgradeArgs,
  mapTechnologyFallbackError
} from '../../src/main/winget-install.js';

export async function run() {
  const upgradeArgs = buildWingetUpgradeArgs('Example.App', 'winget');
  assert.deepEqual(upgradeArgs.slice(0, 5), ['upgrade', '--id', 'Example.App', '--exact', '--silent']);
  assert.deepEqual(upgradeArgs.slice(5, 7), ['--source', 'winget']);
  assert.equal(upgradeArgs.includes('--architecture'), false);

  const fallbackArgs = buildWingetForceInstallArgs('Example.App', 'msstore');
  assert.equal(fallbackArgs.includes('--exact'), true);
  assert.equal(fallbackArgs.includes('--force'), true);
  assert.equal(fallbackArgs.includes('--architecture'), false);
  assert.deepEqual(fallbackArgs.slice(6, 8), ['--source', 'msstore']);

  const reboot = new Error('RebootRequired: installed but restart is required.');
  assert.equal(mapTechnologyFallbackError(reboot), reboot);
  assert.match(mapTechnologyFallbackError(new Error('installer failed')).message, /^Inapplicable:/);
}
