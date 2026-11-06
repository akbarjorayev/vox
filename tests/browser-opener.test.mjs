import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserOpener } from '../scripts/lib/browser-opener.mjs';

const URL_TO_OPEN = 'http://127.0.0.1:5000/token/';

async function commandFor(platform) {
  const calls = [];
  await new BrowserOpener({ run: async (invocation) => calls.push(invocation) }, platform).open(URL_TO_OPEN);
  return calls[0];
}

test('windows opens links through the shell handler', async () => {
  const call = await commandFor('win32');

  assert.equal(call.command, 'rundll32');
  assert.deepEqual(call.args, ['url.dll,FileProtocolHandler', URL_TO_OPEN]);
});

test('macOS uses open', async () => {
  assert.deepEqual(await commandFor('darwin'), { command: 'open', args: [URL_TO_OPEN] });
});

test('other systems use xdg-open', async () => {
  assert.deepEqual(await commandFor('linux'), { command: 'xdg-open', args: [URL_TO_OPEN] });
});

test('a failure to open is passed on to the caller', async () => {
  const opener = new BrowserOpener({ run: async () => Promise.reject(new Error('no browser')) }, 'linux');

  await assert.rejects(opener.open(URL_TO_OPEN), /no browser/);
});
