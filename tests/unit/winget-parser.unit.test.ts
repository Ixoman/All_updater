import assert from 'node:assert/strict';
import { WingetService } from '../../src/main/services/winget.js';

type WingetParserHarness = {
  parseWingetOutput: (output: string) => Array<{ id: string; name: string; version: string; available: string; source: string }>;
  parseWingetJsonOutput: (output: string) => Array<{ id: string; name: string; version: string; available: string; source: string }> | null;
};

export async function run() {
  const service = new WingetService({} as never) as unknown as WingetParserHarness;

  const textOutput = [
    'Name                     Id                      Version    Available  Source',
    '--------------------------------------------------------------------------',
    'Git                      Git.Git                 2.45.1     2.46.0     winget',
    'Microsoft Edge           Microsoft.Edge          124.0.1    125.0.0    winget'
  ].join('\n');

  const parsedText = service.parseWingetOutput(textOutput);
  assert.equal(parsedText.length, 2);
  assert.deepEqual(parsedText[0], {
    name: 'Git',
    id: 'Git.Git',
    version: '2.45.1',
    available: '2.46.0',
    source: 'winget'
  });

  const jsonOutput = [
    'noise before json',
    '{"Sources":[{"Packages":[{"PackageName":"OBS Studio","PackageIdentifier":"OBSProject.OBSStudio","InstalledVersion":"31.0.0","AvailableVersion":"31.0.1","Source":"winget"}]}]}'
  ].join('\n');

  const parsedJson = service.parseWingetJsonOutput(jsonOutput);
  assert.ok(parsedJson);
  assert.equal(parsedJson?.length, 1);
  assert.deepEqual(parsedJson?.[0], {
    name: 'OBS Studio',
    id: 'OBSProject.OBSStudio',
    version: '31.0.0',
    available: '31.0.1',
    source: 'winget'
  });

  assert.equal(service.parseWingetJsonOutput('not-json'), null);
  assert.deepEqual(
    service.parseWingetOutput('No se encontró ningún paquete que coincida con los criterios de entrada.'),
    []
  );

  assert.deepEqual(
    service.parseWingetOutput('Git.Git 2.45.1 2.46.0 invalid-line-without-name-column'),
    []
  );
}
