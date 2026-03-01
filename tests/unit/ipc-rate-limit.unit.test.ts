import assert from 'node:assert/strict';
import { assertWithinIpcRateLimit, pruneExpiredIpcRateLimits } from '../../src/main/ipc-rate-limit.js';

export async function run() {
  const state = new Map<string, { windowStartedAt: number; count: number }>();
  const config = { windowMs: 1000, maxCalls: 2 };

  assert.doesNotThrow(() => assertWithinIpcRateLimit(state, 'sender:channel', config, 100));
  assert.doesNotThrow(() => assertWithinIpcRateLimit(state, 'sender:channel', config, 200));
  assert.throws(
    () => assertWithinIpcRateLimit(state, 'sender:channel', config, 300),
    /Too many requests/
  );

  const resetState = new Map<string, { windowStartedAt: number; count: number }>();
  const resetConfig = { windowMs: 1000, maxCalls: 1 };

  assert.doesNotThrow(() => assertWithinIpcRateLimit(resetState, 'sender:channel', resetConfig, 100));
  assert.doesNotThrow(() => assertWithinIpcRateLimit(resetState, 'sender:channel', resetConfig, 1200));

  const pruneState = new Map<string, { windowStartedAt: number; count: number }>([
    ['old', { windowStartedAt: 100, count: 1 }],
    ['fresh', { windowStartedAt: 1100, count: 1 }]
  ]);

  pruneExpiredIpcRateLimits(pruneState, 500, 1500);

  assert.equal(pruneState.has('old'), false);
  assert.equal(pruneState.has('fresh'), true);
}
