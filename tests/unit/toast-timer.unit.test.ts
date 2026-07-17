import assert from 'node:assert/strict';
import { createToastAutoCloseHandler } from '../../src/utils/toast-timer.js';

export async function run() {
  const calls: string[] = [];
  const callbackRef = { current: (id: string) => calls.push(`old:${id}`) };
  const scheduledHandler = createToastAutoCloseHandler(callbackRef, 'toast-1');

  callbackRef.current = (id: string) => calls.push(`new:${id}`);
  scheduledHandler();

  assert.deepEqual(calls, ['new:toast-1']);
}
