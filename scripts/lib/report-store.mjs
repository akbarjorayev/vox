import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const POLL_MS = 100;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// How the background worker tells the command that launched it whether
// speaking began ('started') or could not ('failed').
export class ReportStore {
  #file;
  #sleep;

  constructor(file, sleep = defaultSleep) {
    this.#file = file;
    this.#sleep = sleep;
  }

  write(result) {
    mkdirSync(dirname(this.#file), { recursive: true });
    writeFileSync(this.#file, result);
  }

  clear() {
    rmSync(this.#file, { force: true });
  }

  read() {
    try {
      return readFileSync(this.#file, 'utf8') || null;
    } catch {
      return null;
    }
  }

  // Resolves as soon as a result is written, or null if none arrives in time.
  async waitForResult(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = this.read();
      if (result) return result;
      await this.#sleep(POLL_MS);
    }
    return null;
  }
}
