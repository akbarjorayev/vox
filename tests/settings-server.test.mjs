import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { SettingsServer } from '../scripts/lib/settings-server.mjs';
import { Settings } from '../scripts/lib/settings.mjs';

const TOKEN = 'abc123';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function withServer(run, { idleMs = 60_000 } = {}) {
  let saved = new Settings();
  const previews = [];
  const server = new SettingsServer({
    settingsStore: { load: () => saved, save: (next) => (saved = next) },
    preview: async (settings) => previews.push(settings.toJSON()),
    html: '<h1>page</h1>',
    voices: [{ id: 'en-US-AriaNeural', label: 'Aria' }],
    token: TOKEN,
    idleMs,
  });
  const base = await server.listen();
  try {
    await run({ base, server, previews, getSaved: () => saved });
  } finally {
    server.close();
  }
}

const post = (url, body, headers = JSON_HEADERS) =>
  fetch(url, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('serves the page at the secret address', async () => {
  await withServer(async ({ base }) => {
    const response = await fetch(base);

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.equal(await response.text(), '<h1>page</h1>');
  });
});

test('every other address is not found, including a wrong token', async () => {
  await withServer(async ({ base }) => {
    const root = new URL(base).origin;

    assert.equal((await fetch(`${root}/`)).status, 404);
    assert.equal((await fetch(`${root}/wrong/`)).status, 404);
    assert.equal((await fetch(`${base}nope`)).status, 404);
  });
});

test('a request with a foreign Host header is refused', async () => {
  await withServer(async ({ base }) => {
    const { port, pathname } = new URL(base);
    const status = await new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path: pathname, headers: { Host: 'evil.example' } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end();
    });

    assert.equal(status, 403);
  });
});

test('current settings and the voice list are offered to the page', async () => {
  await withServer(async ({ base }) => {
    const body = await (await fetch(`${base}api/settings`)).json();

    assert.equal(body.settings.speed, 1);
    assert.equal(body.voices[0].id, 'en-US-AriaNeural');
  });
});

test('preview speaks with the page values without saving them', async () => {
  await withServer(async ({ base, previews, getSaved }) => {
    const response = await post(`${base}api/preview`, { voice: 'en-GB-RyanNeural', speed: 1.4 });

    assert.equal(response.status, 200);
    assert.equal(previews[0].voice, 'en-GB-RyanNeural');
    assert.equal(previews[0].speed, 1.4);
    assert.equal(getSaved().speed, 1);
  });
});

test('save stores the values and then shuts the server down', async () => {
  await withServer(async ({ base, server, getSaved }) => {
    const response = await post(`${base}api/save`, { voice: 'en-GB-RyanNeural', speed: 1.4 });

    assert.equal(response.status, 200);
    assert.equal(getSaved().voice, 'en-GB-RyanNeural');
    assert.equal(getSaved().speed, 1.4);
    await server.closed;
  });
});

test('invalid values are refused and nothing is saved', async () => {
  await withServer(async ({ base, getSaved }) => {
    assert.equal((await post(`${base}api/save`, { voice: 'nope', speed: 1 })).status, 400);
    assert.equal((await post(`${base}api/save`, { voice: 'en-US-AriaNeural', speed: 99 })).status, 400);
    assert.equal(getSaved().speed, 1);
  });
});

test('posts that are not JSON are refused', async () => {
  await withServer(async ({ base }) => {
    const asForm = await post(`${base}api/save`, 'speed=2', { 'Content-Type': 'application/x-www-form-urlencoded' });
    const broken = await post(`${base}api/save`, '{ not json');

    assert.equal(asForm.status, 415);
    assert.equal(broken.status, 400);
  });
});

test('an oversized body is refused', async () => {
  await withServer(async ({ base }) => {
    const response = await post(`${base}api/save`, { voice: 'x'.repeat(20_000), speed: 1 });

    assert.equal(response.status, 413);
  });
});

test('the server closes itself after being idle', async () => {
  await withServer(async ({ server }) => {
    await server.closed;
  }, { idleMs: 50 });
});

test('save keeps the fields the page leaves out', async () => {
  await withServer(async ({ base, getSaved }) => {
    await post(`${base}api/save`, { voice: 'en-GB-RyanNeural', speed: 1.4, auto: true });

    const response = await post(`${base}api/save`, { speed: 1.2 });

    assert.equal(response.status, 200);
    assert.equal(getSaved().voice, 'en-GB-RyanNeural');
    assert.equal(getSaved().speed, 1.2);
    assert.equal(getSaved().auto, true);
  });
});

test('save stores the auto-speak choice', async () => {
  await withServer(async ({ base, getSaved }) => {
    await post(`${base}api/save`, { voice: 'en-US-AriaNeural', speed: 1, auto: true });

    assert.equal(getSaved().auto, true);
  });
});
