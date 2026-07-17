import assert from 'node:assert/strict';
import { isAllowedGitHubDownloadHost } from '../../src/main/app-update-validation.js';

export async function run() {
  assert.equal(isAllowedGitHubDownloadHost('github.com'), true);
  assert.equal(isAllowedGitHubDownloadHost('uploads.github.com'), true);
  assert.equal(isAllowedGitHubDownloadHost('objects.githubusercontent.com'), true);
  assert.equal(isAllowedGitHubDownloadHost('release-assets.githubusercontent.com'), true);
  assert.equal(isAllowedGitHubDownloadHost('RELEASE-ASSETS.GITHUBUSERCONTENT.COM'), true);

  assert.equal(isAllowedGitHubDownloadHost('githubusercontent.com'), false);
  assert.equal(isAllowedGitHubDownloadHost('release-assets.githubusercontent.com.evil.test'), false);
  assert.equal(isAllowedGitHubDownloadHost('github.com.evil.test'), false);
  assert.equal(isAllowedGitHubDownloadHost('example.com'), false);
}
