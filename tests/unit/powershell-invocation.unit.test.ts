import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import {
  createSignaturePowerShellInvocation,
  createZipExpandPowerShellInvocation
} from '../../src/main/powershell-invocation.js';

export async function run() {
  const signatureInvocation = createSignaturePowerShellInvocation('C:\\Path With Spaces\\app.exe');
  assert.equal(signatureInvocation.script.includes('$args['), false);
  assert.equal(signatureInvocation.env.ALL_UPDATER_SIGNATURE_PATH, 'C:\\Path With Spaces\\app.exe');

  const zipInvocation = createZipExpandPowerShellInvocation('C:\\Path With Spaces\\app.zip', 'C:\\Temp Folder');
  assert.equal(zipInvocation.script.includes('$args['), false);
  assert.equal(zipInvocation.env.ALL_UPDATER_ZIP_PATH, 'C:\\Path With Spaces\\app.zip');
  assert.equal(zipInvocation.env.ALL_UPDATER_ZIP_DESTINATION, 'C:\\Temp Folder');

  if (process.platform !== 'win32') return;

  const runtimeSignatureInvocation = createSignaturePowerShellInvocation(process.execPath);
  const signatureResult = await execa('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    runtimeSignatureInvocation.script
  ], { reject: false, env: runtimeSignatureInvocation.env });
  assert.equal(signatureResult.exitCode, 0, signatureResult.stderr);
  const signatureRecord = JSON.parse(signatureResult.stdout) as { Status?: unknown };
  assert.equal(typeof signatureRecord.Status, 'string');

  const tempFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'all-updater-zip-test-'));
  try {
    const sourceFolder = path.join(tempFolder, 'source with spaces');
    const zipPath = path.join(tempFolder, 'archive with spaces.zip');
    const destinationPath = path.join(tempFolder, 'destination with spaces');
    fs.mkdirSync(sourceFolder);
    fs.writeFileSync(path.join(sourceFolder, 'fixture.txt'), 'ok', 'utf8');

    const compressResult = await execa('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory($env:TEST_ZIP_SOURCE, $env:TEST_ZIP_PATH)"
    ], {
      reject: false,
      env: { TEST_ZIP_SOURCE: sourceFolder, TEST_ZIP_PATH: zipPath }
    });
    assert.equal(compressResult.exitCode, 0, compressResult.stderr);

    const runtimeZipInvocation = createZipExpandPowerShellInvocation(zipPath, destinationPath);
    const expandResult = await execa('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      runtimeZipInvocation.script
    ], { reject: false, env: runtimeZipInvocation.env });
    assert.equal(expandResult.exitCode, 0, expandResult.stderr);
    assert.equal(fs.readFileSync(path.join(destinationPath, 'fixture.txt'), 'utf8'), 'ok');
  } finally {
    fs.rmSync(tempFolder, { recursive: true, force: true });
  }
}
