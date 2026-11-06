import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FallbackEngine,
  createNativeEngine,
  createSpeechEngine,
  edgeRate,
  nativeWordsPerMinute,
  sapiRate,
} from '../scripts/lib/engines.mjs';

class FakeFiles {
  removed = [];
  pathFor(extension) {
    return `audio.${extension}`;
  }
  remove(file) {
    this.removed.push(file);
  }
}

class FakeRunner {
  calls = [];
  constructor(failure = null) {
    this.failure = failure;
  }
  async run(invocation) {
    this.calls.push(invocation);
    if (this.failure) throw this.failure;
  }
}

const OPTIONS = { voice: 'en-US-AriaNeural', speed: 1 };
const RATE_LIMITED = new Error('Unexpected server response: 429');
const noWait = async () => {};

// Fails with each error in turn, then succeeds.
function flakyEngine(...errors) {
  const engine = {
    calls: 0,
    async synthesize() {
      const error = errors[engine.calls++];
      if (error) throw error;
      return 'preferred.mp3';
    },
  };
  return engine;
}

test('edge rate is "default" at normal speed and a signed percentage otherwise', () => {
  assert.equal(edgeRate(1), 'default');
  assert.equal(edgeRate(1.25), '+25%');
  assert.equal(edgeRate(0.8), '-20%');
});

test('native words per minute scales with speed', () => {
  assert.equal(nativeWordsPerMinute(1), 175);
  assert.equal(nativeWordsPerMinute(2), 350);
});

test('SAPI rate stays within -10..10', () => {
  assert.equal(sapiRate(1), 0);
  assert.equal(sapiRate(1.5), 5);
  assert.equal(sapiRate(5), 10);
  assert.equal(sapiRate(0), -10);
});

test('windows native engine picks the offline voice matching the setting gender', async () => {
  const runner = new FakeRunner();
  const engine = createNativeEngine('win32', runner, new FakeFiles());

  await engine.synthesize('hi', { voice: 'en-US-AriaNeural', speed: 1 });
  await engine.synthesize('hi', { voice: 'en-US-GuyNeural', speed: 1 });

  assert.equal(runner.calls[0].env.VOX_GENDER, 'Female');
  assert.equal(runner.calls[1].env.VOX_GENDER, 'Male');
});

test('a voice vox does not list is read by a female offline voice', async () => {
  const runner = new FakeRunner();
  await createNativeEngine('win32', runner, new FakeFiles()).synthesize('hi', { voice: 'de-DE-KillianNeural', speed: 1 });

  assert.equal(runner.calls[0].env.VOX_GENDER, 'Female');
});

test('mac and linux native voices follow the setting gender too', async () => {
  const runner = new FakeRunner();
  await createNativeEngine('darwin', runner, new FakeFiles()).synthesize('hi', { voice: 'en-GB-RyanNeural', speed: 1 });
  await createNativeEngine('linux', runner, new FakeFiles()).synthesize('hi', OPTIONS);

  assert.deepEqual(runner.calls[0].args.slice(0, 2), ['-v', 'Daniel']);
  assert.deepEqual(runner.calls[1].args.slice(0, 2), ['-v', 'en+f3']);
});

test('windows native engine passes text through the environment', async () => {
  const runner = new FakeRunner();
  const file = await createNativeEngine('win32', runner, new FakeFiles()).synthesize('hi "there"', OPTIONS);

  assert.equal(file, 'audio.wav');
  assert.equal(runner.calls[0].command, 'powershell');
  assert.equal(runner.calls[0].env.VOX_TEXT, 'hi "there"');
  assert.equal(runner.calls[0].env.VOX_OUT, 'audio.wav');
});

test('mac native engine uses say with the text on stdin', async () => {
  const runner = new FakeRunner();
  const file = await createNativeEngine('darwin', runner, new FakeFiles()).synthesize('hi', { ...OPTIONS, speed: 2 });

  assert.equal(file, 'audio.aiff');
  assert.deepEqual(runner.calls[0], {
    command: 'say',
    args: ['-v', 'Samantha', '-o', 'audio.aiff', '-r', '350'],
    input: 'hi',
  });
});

test('on a Mac without the chosen voice, the system voice reads instead of nothing', async () => {
  const runner = new FakeRunner();
  runner.run = async (invocation) => {
    runner.calls.push(invocation);
    if (invocation.args.includes('Daniel')) throw new Error('Voice Daniel not found');
  };
  const file = await createNativeEngine('darwin', runner, new FakeFiles()).synthesize('hi', { voice: 'en-GB-RyanNeural', speed: 1 });

  assert.equal(file, 'audio.aiff');
  assert.deepEqual(runner.calls.map((call) => call.args.slice(0, 2)), [['-v', 'Daniel'], ['-o', 'audio.aiff']]);
});

test('any other platform uses espeak-ng', async () => {
  const runner = new FakeRunner();
  await createNativeEngine('linux', runner, new FakeFiles()).synthesize('hi', OPTIONS);

  assert.equal(runner.calls[0].command, 'espeak-ng');
});

test('a failed native run removes its partial file and rethrows', async () => {
  const files = new FakeFiles();
  const engine = createNativeEngine('linux', new FakeRunner(new Error('boom')), files);

  await assert.rejects(engine.synthesize('hi', OPTIONS), /boom/);
  assert.deepEqual(files.removed, ['audio.wav']);
});

const online = { isReachable: async () => true };
const offline = { isReachable: async () => false };
const BACKUP = { synthesize: async () => 'backup.wav' };

// A fallback engine that is online, never waits and logs into a list.
function fallback(overrides) {
  const logs = [];
  const engine = new FallbackEngine({
    backup: BACKUP,
    probe: online,
    files: new FakeFiles(),
    wait: noWait,
    logger: { log: (...parts) => logs.push(parts) },
    ...overrides,
  });
  return { engine, logs };
}

test('fallback engine uses the preferred engine when it works', async () => {
  const { engine, logs } = fallback({ preferred: flakyEngine() });

  assert.equal(await engine.synthesize('hi', OPTIONS), 'preferred.mp3');
  assert.equal(logs.length, 0);
});

test('fallback engine switches to the backup and logs why', async () => {
  const { engine, logs } = fallback({ preferred: flakyEngine(new Error('socket hang up')) });

  assert.equal(await engine.synthesize('hi', OPTIONS), 'backup.wav');
  assert.equal(logs.length, 1);
});

test('when the online voice is rate limited, it waits and tries once more before the backup', async () => {
  const preferred = flakyEngine(RATE_LIMITED);
  const waits = [];
  const { engine } = fallback({ preferred, wait: async (ms) => waits.push(ms) });

  assert.equal(await engine.synthesize('hi', OPTIONS), 'preferred.mp3');
  assert.equal(preferred.calls, 2);
  assert.equal(waits.length, 1);
});

test('a second refusal goes to the backup, and the next sentence tries online again', async () => {
  const preferred = flakyEngine(RATE_LIMITED, RATE_LIMITED);
  const { engine } = fallback({ preferred });

  assert.equal(await engine.synthesize('one', OPTIONS), 'backup.wav');
  assert.equal(await engine.synthesize('two', OPTIONS), 'preferred.mp3');
  assert.equal(preferred.calls, 3);
});

test('when the voice server cannot be reached, the backup starts without waiting for the online voice', async () => {
  const hanging = { calls: 0, synthesize: () => (hanging.calls++, new Promise(() => {})) };
  const { engine } = fallback({ preferred: hanging, probe: offline });

  assert.equal(await engine.synthesize('one', OPTIONS), 'backup.wav');
  assert.equal(await engine.synthesize('two', OPTIONS), 'backup.wav');
  assert.equal(hanging.calls, 1, 'only the first sentence tried, alongside the probe');
});

test('an abandoned online try that finishes late has its file removed', async () => {
  let finish;
  const late = { synthesize: () => new Promise((resolve) => (finish = resolve)) };
  const files = new FakeFiles();
  const { engine } = fallback({ preferred: late, probe: offline, files });

  assert.equal(await engine.synthesize('one', OPTIONS), 'backup.wav');
  finish('late.mp3');
  await new Promise(setImmediate);

  assert.deepEqual(files.removed, ['late.mp3']);
});

test('online, the first sentence does not wait for the probe', async () => {
  const slowProbe = { isReachable: () => new Promise(() => {}) };
  const { engine } = fallback({ preferred: flakyEngine(), probe: slowProbe });

  assert.equal(await engine.synthesize('one', OPTIONS), 'preferred.mp3');
});

test('after a network failure the rest of the reply uses the backup at once', async () => {
  const preferred = flakyEngine(new Error('Timed out while connecting to Edge TTS'));
  const { engine } = fallback({ preferred });

  assert.equal(await engine.synthesize('one', OPTIONS), 'backup.wav');
  assert.equal(await engine.synthesize('two', OPTIONS), 'backup.wav');
  assert.equal(preferred.calls, 1);
});

test('when the player cannot play MP3, only the native voice is used', async () => {
  const runner = new FakeRunner();
  const engine = createSpeechEngine({
    platform: 'linux',
    canPlayMp3: false,
    runner,
    files: new FakeFiles(),
    logger: { log() {} },
  });

  assert.equal(await engine.synthesize('hi', OPTIONS), 'audio.wav');
  assert.equal(runner.calls.length, 1);
});
