import assert from 'node:assert/strict';
import { WingetService } from '../../src/main/services/winget.js';

interface IntegrationUpdate {
  id: string;
  name: string;
  version: string;
  available: string;
  source: string;
  previousStatus?: string;
  previousDetails?: string;
}

interface WingetServiceIntegrationHarness {
  getAvailableUpdates: () => Promise<IntegrationUpdate[]>;
  tryGetUpdatesFromJson: () => Promise<IntegrationUpdate[] | null>;
  runWingetCommandWithFallback?: () => Promise<{ stdout: string; stderr: string; all: string; exitCode: number | null }>;
}

export async function run() {
  const nowIso = new Date().toISOString();

  const history = [
    {
      id: 'SublimeHQ.SublimeText',
      appName: 'Sublime Text',
      version: '4.0',
      previousVersion: 'Unknown',
      status: 'success',
      date: nowIso
    },
    {
      id: 'Foo.Bar',
      appName: 'Foo Bar',
      version: '2.0',
      previousVersion: '1.0',
      status: 'inapplicable',
      details: 'Manual uninstall required',
      date: nowIso
    },
    {
      id: 'Baz.App',
      appName: 'Baz App',
      version: '5.0',
      previousVersion: 'Unknown',
      status: 'inapplicable',
      details: 'Already handled recently',
      date: nowIso
    }
  ];

  const service = new WingetService(
    { getHistory: () => history } as never
  ) as unknown as WingetServiceIntegrationHarness;

  service.tryGetUpdatesFromJson = async () => ([
    {
      name: 'Sublime Text',
      id: 'SublimeHQ.SublimeText',
      version: 'Unknown',
      available: '4.0',
      source: 'winget'
    },
    {
      name: 'Foo Bar',
      id: 'Foo.Bar',
      version: '1.0',
      available: '2.0',
      source: 'winget'
    },
    {
      name: 'Baz App',
      id: 'Baz.App',
      version: 'Unknown',
      available: '5.0',
      source: 'winget'
    },
    {
      name: 'Git',
      id: 'Git.Git',
      version: '2.45.1',
      available: '2.46.0',
      source: 'winget'
    }
  ]);

  const filteredUpdates = await service.getAvailableUpdates();

  assert.deepEqual(
    filteredUpdates.map((item: { id: string }) => item.id),
    ['Foo.Bar', 'Git.Git']
  );
  assert.equal(filteredUpdates[0].previousStatus, 'inapplicable');
  assert.equal(filteredUpdates[0].previousDetails, 'Manual uninstall required');

  const textFallbackService = new WingetService() as unknown as WingetServiceIntegrationHarness;
  textFallbackService.tryGetUpdatesFromJson = async () => null;
  textFallbackService.runWingetCommandWithFallback = async () => ({
    stdout: '',
    stderr: '',
    all: [
      'Name                     Id                      Version    Available  Source',
      '--------------------------------------------------------------------------',
      'OBS Studio               OBSProject.OBSStudio    31.0.0     31.0.1     winget'
    ].join('\n'),
    exitCode: 0
  });

  const textParsedUpdates = await textFallbackService.getAvailableUpdates();

  assert.equal(textParsedUpdates.length, 1);
  assert.equal(textParsedUpdates[0].id, 'OBSProject.OBSStudio');
  assert.equal(textParsedUpdates[0].available, '31.0.1');

  const deniedService = new WingetService() as unknown as WingetServiceIntegrationHarness;
  deniedService.tryGetUpdatesFromJson = async () => null;
  deniedService.runWingetCommandWithFallback = async () => ({
    stdout: '',
    stderr: 'Access is denied.',
    all: 'Access is denied.',
    exitCode: 5
  });

  await assert.rejects(
    () => deniedService.getAvailableUpdates(),
    /WingetAccessDenied/
  );
}
