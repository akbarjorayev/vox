import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clean } from '../scripts/lib/clean.mjs';
import { MESSAGES } from '../scripts/lib/messages.mjs';
import { Settings } from '../scripts/lib/settings.mjs';
import { Vox } from '../scripts/lib/vox-app.mjs';

function setup({ active = null, canPlayAudio = true, sendFails = false, report = 'started', pageResult = 'opened' } = {}) {
  const sent = [];
  const launched = [];
  const cleared = [];
  const reportCleared = [];
  let settings = new Settings();

  const vox = new Vox({
    store: { readActive: () => active, clear: () => cleared.push(true) },
    client: {
      send: async (_state, command) => {
        sent.push(command);
        if (sendFails) throw new Error('gone');
        return command === 'status' ? 'playing' : 'ok';
      },
    },
    launcher: { launch: (job) => launched.push(job) },
    report: { clear: () => reportCleared.push(true), waitForResult: async () => report },
    settingsPage: { open: async () => pageResult },
    settingsStore: { load: () => settings, save: (next) => (settings = next) },
    clean,
    canPlayAudio: () => canPlayAudio,
    messages: MESSAGES,
  });
  return { vox, sent, launched, cleared, reportCleared, getSettings: () => settings };
}

const RUNNING = { pid: 1, port: 2, token: 't' };

test('speak launches a worker with the cleaned text and settings, and stays silent', async () => {
  const { vox, launched } = setup();

  assert.equal(await vox.speak('Use `config` now.\n```\ncode\n```'), null);
  assert.equal(launched.length, 1);
  assert.equal(launched[0].text, 'Use config now. Code block.');
  assert.equal(launched[0].settings.voice, 'en-US-AriaNeural');
});

test('speak clears the previous report before launching', async () => {
  const { vox, reportCleared } = setup();

  await vox.speak('Hello.');
  assert.equal(reportCleared.length, 1);
});

test('speak tells the user, calmly, when the worker could not speak', async () => {
  const { vox } = setup({ report: 'failed' });

  assert.equal(await vox.speak('Hello.'), MESSAGES.couldntSpeak);
});

test('speak stays silent when no report arrives in time', async () => {
  const { vox } = setup({ report: null });

  assert.equal(await vox.speak('Hello.'), null);
});

test('speak with nothing to say does nothing', async () => {
  const { vox, launched } = setup();

  assert.equal(await vox.speak('   '), null);
  assert.equal(launched.length, 0);
});

test('speak without a speaker explains calmly and launches nothing', async () => {
  const { vox, launched } = setup({ canPlayAudio: false });

  assert.equal(await vox.speak('Hello.'), MESSAGES.noSpeaker);
  assert.equal(launched.length, 0);
});

test('speak replaces anything already playing', async () => {
  const { vox, sent, launched } = setup({ active: RUNNING });

  await vox.speak('Hello.');
  assert.deepEqual(sent, ['stop']);
  assert.equal(launched.length, 1);
});

test('pause, resume and stop talk to the running worker', async () => {
  const { vox, sent } = setup({ active: RUNNING });

  assert.equal(await vox.pause(), MESSAGES.paused);
  assert.equal(await vox.resume(), null);
  assert.equal(await vox.stop(), MESSAGES.stopped);
  assert.deepEqual(sent, ['pause', 'resume', 'stop']);
});

test('controls say so when nothing is playing', async () => {
  const { vox } = setup();

  assert.equal(await vox.pause(), MESSAGES.nothingPlaying);
  assert.equal(await vox.resume(), MESSAGES.nothingPlaying);
  assert.equal(await vox.stop(), MESSAGES.nothingPlaying);
});

test('a worker that no longer answers is forgotten', async () => {
  const { vox, cleared } = setup({ active: RUNNING, sendFails: true });

  assert.equal(await vox.pause(), MESSAGES.nothingPlaying);
  assert.equal(cleared.length, 1);
});

test('status reports ready, or what the worker says', async () => {
  assert.equal(await setup().vox.status(), MESSAGES.ready);
  assert.equal(await setup({ active: RUNNING }).vox.status(), MESSAGES.playing);
});

test('settings are listed and can be changed', () => {
  const { vox, getSettings } = setup();

  assert.match(vox.settings(), /speed: 1/);
  assert.equal(vox.changeSetting('speed', '1.5'), MESSAGES.saved);
  assert.equal(getSettings().speed, 1.5);
});

test('a bad setting value is refused politely and nothing changes', () => {
  const { vox, getSettings } = setup();

  assert.equal(vox.changeSetting('speed', 'warp'), MESSAGES.badSetting);
  assert.equal(vox.changeSetting('colour', 'red'), MESSAGES.badSetting);
  assert.equal(getSettings().speed, 1);
});

test('preview plays a sample with the given, unsaved settings', async () => {
  const { vox, launched, getSettings } = setup();

  assert.equal(await vox.preview({ voice: 'en-GB-RyanNeural', speed: 1.5 }), null);
  assert.equal(launched[0].settings.voice, 'en-GB-RyanNeural');
  assert.equal(launched[0].settings.speed, 1.5);
  assert.match(launched[0].text, /how I sound/);
  assert.equal(getSettings().speed, 1);
});

test('preview rejects invalid settings', () => {
  const { vox } = setup();

  assert.throws(() => vox.preview({ voice: 'bad', speed: 1 }));
});

test('preview without a speaker explains calmly', () => {
  assert.equal(setup({ canPlayAudio: false }).vox.preview({ voice: 'en-US-AriaNeural', speed: 1 }), MESSAGES.noSpeaker);
});

test('opening the settings page is silent when it opened', async () => {
  assert.equal(await setup().vox.openSettingsPage(), null);
});

test('opening the settings page shows the link when no browser opened', async () => {
  const { vox } = setup({ pageResult: 'http://127.0.0.1:5/t/' });

  assert.equal(await vox.openSettingsPage(), `${MESSAGES.openLink} http://127.0.0.1:5/t/`);
});

test('opening the settings page says so calmly when nothing happened', async () => {
  assert.equal(await setup({ pageResult: null }).vox.openSettingsPage(), MESSAGES.couldntOpenSettings);
});
