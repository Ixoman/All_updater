import assert from 'node:assert/strict';
import {
  buildIgnoreRuleKey,
  isUpdateIgnoredByRule,
  isUpdateSelectable,
  parseEstimatedPercentFromWingetLog,
  parseInstallerFailurePayload,
  parsePercentFromWingetLog
} from '../../src/utils/app-helpers.js';

export async function run() {
  assert.equal(parsePercentFromWingetLog('12% ... 48% ... 100%'), 100);
  assert.equal(parsePercentFromWingetLog('value 220% should clamp'), 100);
  assert.equal(parsePercentFromWingetLog('no percent here'), null);

  assert.equal(parseEstimatedPercentFromWingetLog('Starting package install...'), 12);
  assert.equal(parseEstimatedPercentFromWingetLog('Descargando archivos del instalador'), 28);
  assert.equal(parseEstimatedPercentFromWingetLog('Finalizando instalacion'), 95);
  assert.equal(parseEstimatedPercentFromWingetLog('completely unrelated text'), null);

  const update = {
    name: 'Sample App',
    id: 'Sample.App',
    version: '1.0.0',
    available: '2.0.0',
    source: 'winget'
  };

  assert.equal(buildIgnoreRuleKey(update.id, update.available), 'Sample.App@@2.0.0');
  assert.equal(buildIgnoreRuleKey(update.id), 'Sample.App@@*');
  assert.equal(isUpdateSelectable({ ...update, previousStatus: 'inapplicable' }), true);
  assert.equal(isUpdateSelectable({ ...update, previousStatus: 'skipped' }), false);

  assert.equal(
    isUpdateIgnoredByRule(update, {
      id: 'Sample.App',
      availableVersion: '2.0.0',
      until: '2099-01-01T00:00:00.000Z',
      createdAt: '2098-01-01T00:00:00.000Z'
    }),
    true
  );

  assert.equal(
    isUpdateIgnoredByRule(update, {
      id: 'Sample.App',
      availableVersion: '3.0.0',
      until: '2099-01-01T00:00:00.000Z',
      createdAt: '2098-01-01T00:00:00.000Z'
    }),
    false
  );

  assert.deepEqual(
    parseInstallerFailurePayload('InstallerFailed: {"category":"permission","installerExitCode":"1"}'),
    { category: 'permission', installerExitCode: '1' }
  );
  assert.deepEqual(parseInstallerFailurePayload('InstallerFailed: not-json'), {});
  assert.equal(parseInstallerFailurePayload('some unrelated error'), null);
}
