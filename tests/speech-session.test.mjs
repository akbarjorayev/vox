import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpeechSession } from '../scripts/lib/speech-session.mjs';

const tick = () => new Promise((resolve) => setImmediate(resolve));

class FakeEngine {
  requested = [];
  constructor(failOn = null) {
    this.failOn = failOn;
  }
  async synthesize(text) {
    this.requested.push(text);
    if (text === this.failOn) throw new Error('no voice');
    return `${text}.mp3`;
  }
}

// Each play() stays open until the test calls finish(), like real audio.
class FakePlayer {
  played = [];
  calls = [];
  #resolve = null;
  play(file) {
    this.played.push(file);
    return new Promise((resolve) => (this.#resolve = resolve));
  }
  finish(result = 'ended') {
    this.#resolve?.(result);
  }
  pause() {
    this.calls.push('pause');
  }
  resume() {
    this.calls.push('resume');
  }
  stop() {
    this.calls.push('stop');
    this.finish('stopped');
  }
}

function setup(chunks, engine = new FakeEngine()) {
  const player = new FakePlayer();
  const removed = [];
  const logs = [];
  const starts = [];
  const session = new SpeechSession({
    chunks,
    engine,
    player,
    files: { remove: (file) => removed.push(file) },
    options: { voice: 'v', speed: 1 },
    logger: { log: (...parts) => logs.push(parts) },
    onStart: () => starts.push(player.played.length),
  });
  return { session, player, engine, removed, logs, starts };
}

test('onStart fires once, just before the first audio plays', async () => {
  const { session, player, starts } = setup(['a', 'b']);
  const done = session.run();

  await tick();
  player.finish();
  await tick();
  player.finish();
  await done;

  assert.deepEqual(starts, [0]);
});

test('onStart does not fire when synthesis fails or the session is stopped first', async () => {
  const failing = setup(['a'], new FakeEngine('a'));
  await failing.session.run();
  assert.deepEqual(failing.starts, []);

  const stopped = setup(['a']);
  const done = stopped.session.run();
  stopped.session.stop();
  await done;
  assert.deepEqual(stopped.starts, []);
});

test('plays every chunk in order and removes each file', async () => {
  const { session, player, removed } = setup(['a', 'b']);
  const done = session.run();

  await tick();
  player.finish();
  await tick();
  player.finish();

  assert.equal(await done, 'finished');
  assert.deepEqual(player.played, ['a.mp3', 'b.mp3']);
  assert.deepEqual(removed, ['a.mp3', 'b.mp3']);
  assert.equal(session.status, 'idle');
});

test('prepares the next chunk while the current one is playing', async () => {
  const { session, player, engine } = setup(['a', 'b']);
  const done = session.run();

  await tick();
  assert.deepEqual(engine.requested, ['a', 'b']);
  assert.deepEqual(player.played, ['a.mp3']);

  session.stop();
  await done;
});

test('stop ends the session and cleans up the prepared chunk', async () => {
  const { session, player, removed } = setup(['a', 'b']);
  const done = session.run();

  await tick();
  session.stop();

  assert.equal(await done, 'stopped');
  assert.deepEqual(player.calls, ['stop']);
  await tick();
  assert.deepEqual(removed.sort(), ['a.mp3', 'b.mp3']);
});

test('pause and resume are passed to the player and reflected in status', async () => {
  const { session, player } = setup(['a']);
  const done = session.run();

  await tick();
  session.pause();
  assert.equal(session.status, 'paused');
  session.resume();
  assert.equal(session.status, 'playing');
  assert.deepEqual(player.calls, ['pause', 'resume']);

  player.finish();
  assert.equal(await done, 'finished');
});

test('pausing between chunks holds back the next chunk until resume', async () => {
  const { session, player } = setup(['a', 'b']);
  const done = session.run();

  await tick();
  session.pause();
  player.finish();
  await tick();
  assert.deepEqual(player.played, ['a.mp3']);

  session.resume();
  await tick();
  assert.deepEqual(player.played, ['a.mp3', 'b.mp3']);

  player.finish();
  assert.equal(await done, 'finished');
});

test('a chunk that cannot be synthesized fails the session and is logged', async () => {
  const { session, logs } = setup(['a'], new FakeEngine('a'));

  assert.equal(await session.run(), 'failed');
  assert.equal(logs.length, 1);
});

test('a failed play ends the session as failed', async () => {
  const { session, player } = setup(['a', 'b']);
  const done = session.run();

  await tick();
  player.finish('failed');

  assert.equal(await done, 'failed');
  assert.deepEqual(player.played, ['a.mp3']);
});
