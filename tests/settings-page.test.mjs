import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SettingsPage } from '../scripts/lib/settings-page.mjs';

function setup(result) {
  const events = [];
  const page = new SettingsPage({
    launcher: { launch: () => events.push('launch') },
    report: {
      clear: () => events.push('clear'),
      waitForResult: async () => result,
    },
  });
  return { page, events };
}

test('open clears the old report, launches the page, and returns what it reports', async () => {
  const { page, events } = setup('opened');

  assert.equal(await page.open(), 'opened');
  assert.deepEqual(events, ['clear', 'launch']);
});

test('open returns the link when the page could not open a browser', async () => {
  assert.equal(await setup('http://127.0.0.1:1/t/').page.open(), 'http://127.0.0.1:1/t/');
});

test('open returns null when nothing is reported in time', async () => {
  assert.equal(await setup(null).page.open(), null);
});
