import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const MIN_SPEED = 0.5;
const MAX_SPEED = 2;
const VOICE_PATTERN = /^[a-z]{2,3}-[A-Za-z]{2,4}(-[A-Za-z]+)?-[A-Za-z0-9]+Neural$/;
const ON_WORDS = ['on', 'true', 'yes'];
const OFF_WORDS = ['off', 'false', 'no'];

export class InvalidSettingError extends Error {}

// Each setting knows how to validate itself, so adding one means adding one entry.
const FIELDS = {
  voice: {
    default: 'en-US-AriaNeural',
    parse(raw) {
      if (!VOICE_PATTERN.test(raw)) throw new InvalidSettingError('voice');
      return raw;
    },
  },
  speed: {
    default: 1,
    parse(raw) {
      const speed = Number(raw);
      if (!(speed >= MIN_SPEED && speed <= MAX_SPEED)) throw new InvalidSettingError('speed');
      return speed;
    },
  },
  auto: {
    default: false,
    parse(raw) {
      const word = raw.toLowerCase();
      if (ON_WORDS.includes(word)) return true;
      if (OFF_WORDS.includes(word)) return false;
      throw new InvalidSettingError('auto');
    },
  },
};

// Immutable and always valid: an invalid Settings object cannot exist.
export class Settings {
  #values;

  constructor(values = {}) {
    this.#values = Object.fromEntries(
      Object.entries(FIELDS).map(([key, field]) => [key, field.parse(String(values[key] ?? field.default))]),
    );
  }

  // Reads stored data, ignoring any field that is missing or no longer valid.
  static fromStored(stored) {
    const usable = {};
    for (const [key, field] of Object.entries(FIELDS)) {
      try {
        field.parse(String(stored?.[key]));
        usable[key] = stored[key];
      } catch {
        // Fall back to the default for this field.
      }
    }
    return new Settings(usable);
  }

  get voice() {
    return this.#values.voice;
  }

  get speed() {
    return this.#values.speed;
  }

  get auto() {
    return this.#values.auto;
  }

  with(key, raw) {
    if (!(key in FIELDS)) throw new InvalidSettingError(key);
    return new Settings({ ...this.#values, [key]: raw });
  }

  toJSON() {
    return { ...this.#values };
  }
}

export class SettingsStore {
  #file;

  constructor(file) {
    this.#file = file;
  }

  load() {
    try {
      return Settings.fromStored(JSON.parse(readFileSync(this.#file, 'utf8')));
    } catch {
      return new Settings();
    }
  }

  save(settings) {
    mkdirSync(dirname(this.#file), { recursive: true });
    writeFileSync(this.#file, JSON.stringify(settings, null, 2));
  }
}
