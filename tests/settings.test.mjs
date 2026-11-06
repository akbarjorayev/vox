import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InvalidSettingError, Settings, SettingsStore } from '../scripts/lib/settings.mjs';

test('defaults are sensible', () => {
  const settings = new Settings();
  assert.equal(settings.voice, 'en-US-AriaNeural');
  assert.equal(settings.speed, 1);
  assert.equal(settings.auto, false);
});

test('with() returns a new Settings and leaves the original alone', () => {
  const original = new Settings();
  const faster = original.with('speed', '1.5');

  assert.equal(faster.speed, 1.5);
  assert.equal(original.speed, 1);
});

test('auto accepts on/off words', () => {
  assert.equal(new Settings().with('auto', 'on').auto, true);
  assert.equal(new Settings().with('auto', 'off').auto, false);
});

test('invalid values and unknown keys are rejected', () => {
  const settings = new Settings();
  assert.throws(() => settings.with('speed', '9'), InvalidSettingError);
  assert.throws(() => settings.with('speed', 'fast'), InvalidSettingError);
  assert.throws(() => settings.with('voice', 'nope'), InvalidSettingError);
  assert.throws(() => settings.with('auto', 'maybe'), InvalidSettingError);
  assert.throws(() => settings.with('colour', 'red'), InvalidSettingError);
});

test('fromStored keeps valid fields and ignores invalid ones', () => {
  const settings = Settings.fromStored({ voice: 'bad', speed: 1.25, auto: true });

  assert.equal(settings.voice, 'en-US-AriaNeural');
  assert.equal(settings.speed, 1.25);
  assert.equal(settings.auto, true);
});

test('toJSON round-trips', () => {
  const settings = new Settings().with('speed', '0.8');
  assert.deepEqual(new Settings(settings.toJSON()).toJSON(), settings.toJSON());
});

test('the store saves, loads, and survives a missing or broken file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vox-test-'));
  try {
    const file = join(dir, 'nested', 'config.json');
    const store = new SettingsStore(file);

    assert.equal(store.load().speed, 1);
    store.save(new Settings().with('speed', '1.5'));
    assert.equal(store.load().speed, 1.5);

    writeFileSync(file, '{ not json');
    assert.equal(store.load().speed, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
