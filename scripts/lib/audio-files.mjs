import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Owns the folder where short-lived audio files are written.
export class TempAudioFiles {
  #dir;

  constructor(dir) {
    this.#dir = dir;
  }

  pathFor(extension) {
    mkdirSync(this.#dir, { recursive: true });
    return join(this.#dir, `${randomUUID()}.${extension}`);
  }

  remove(file) {
    rmSync(file, { force: true });
  }

  // Cleans up files left behind by a worker that was stopped mid-synthesis.
  removeOlderThan(maxAgeMs) {
    let names;
    try {
      names = readdirSync(this.#dir);
    } catch {
      return;
    }
    const cutoff = Date.now() - maxAgeMs;
    for (const name of names.filter((n) => /\.(mp3|wav|aiff)$/.test(n))) {
      const file = join(this.#dir, name);
      if (statSync(file, { throwIfNoEntry: false })?.mtimeMs < cutoff) this.remove(file);
    }
  }
}
