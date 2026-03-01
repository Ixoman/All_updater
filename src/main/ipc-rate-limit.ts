export interface IpcRateLimitConfig {
  windowMs: number;
  maxCalls: number;
}

interface IpcRateLimitEntry {
  windowStartedAt: number;
  count: number;
}

export function assertWithinIpcRateLimit(
  state: Map<string, IpcRateLimitEntry>,
  key: string,
  config: IpcRateLimitConfig,
  now = Date.now()
): void {
  const current = state.get(key);

  if (!current || (now - current.windowStartedAt) >= config.windowMs) {
    state.set(key, {
      windowStartedAt: now,
      count: 1
    });
    return;
  }

  if (current.count >= config.maxCalls) {
    throw new Error('Too many requests. Please wait a moment and try again.');
  }

  current.count += 1;
  state.set(key, current);
}

export function pruneExpiredIpcRateLimits(
  state: Map<string, IpcRateLimitEntry>,
  maxWindowMs: number,
  now = Date.now()
): void {
  for (const [key, entry] of state.entries()) {
    if ((now - entry.windowStartedAt) >= maxWindowMs) {
      state.delete(key);
    }
  }
}
