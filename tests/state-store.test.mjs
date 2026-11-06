import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../scripts/lib/state-store.mjs';

function withStore(isAlive, run) {
  const dir = mkdtempSync(join(tmpdir(), 'vox-test-'));
  try {
    run(new StateStore(join(dir, 'sub', 'state.json'), isAlive));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('nothing is active before anything is written', () => {
  withStore(() => true, (store) => assert.equal(store.readActive(), null));
});

test('an alive worker is returned', () => {
  withStore(() => true, (store) => {
    store.write({ pid: 7, port: 1, token: 't' });
    assert.deepEqual(store.readActive(), { pid: 7, port: 1, token: 't' });
  });
});

test('a dead worker is treated as inactive and its record is cleared', () => {
  withStore(() => false, (store) => {
    store.write({ pid: 7 });
    assert.equal(store.readActive(), null);
    assert.equal(store.readActive(), null);
  });
});

test('only the owner can clear the state', () => {
  withStore(() => true, (store) => {
    store.write({ pid: 7 });
    store.clear(99);
    assert.equal(store.readActive()?.pid, 7);
    store.clear(7);
    assert.equal(store.readActive(), null);
  });
});
