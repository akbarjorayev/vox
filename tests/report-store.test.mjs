import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReportStore } from '../scripts/lib/report-store.mjs';

async function withStore(run, sleep) {
  const dir = mkdtempSync(join(tmpdir(), 'vox-test-'));
  try {
    await run(new ReportStore(join(dir, 'sub', 'report.txt'), sleep));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('there is no result until one is written', async () => {
  await withStore((store) => assert.equal(store.read(), null));
});

test('a written result can be read and then cleared', async () => {
  await withStore((store) => {
    store.write('started');
    assert.equal(store.read(), 'started');
    store.clear();
    assert.equal(store.read(), null);
  });
});

test('waitForResult returns immediately when a result already exists', async () => {
  await withStore(async (store) => {
    store.write('failed');
    assert.equal(await store.waitForResult(5000), 'failed');
  });
});

test('waitForResult gives up with null after the timeout', async () => {
  await withStore(async (store) => assert.equal(await store.waitForResult(30), null));
});

test('waitForResult sees a result written while waiting', async () => {
  await withStore(async (store) => {
    setTimeout(() => store.write('started'), 40);
    assert.equal(await store.waitForResult(2000), 'started');
  });
});
