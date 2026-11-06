import { appendFileSync, mkdirSync, statSync, truncateSync } from 'node:fs';
import { dirname } from 'node:path';

const DEFAULT_MAX_BYTES = 200_000;

// Technical details go to a file, never to the screen. Logging must never throw.
export class FileLogger {
  #file;
  #maxBytes;

  constructor(file, maxBytes = DEFAULT_MAX_BYTES) {
    this.#file = file;
    this.#maxBytes = maxBytes;
  }

  log(...parts) {
    try {
      mkdirSync(dirname(this.#file), { recursive: true });
      if (statSync(this.#file, { throwIfNoEntry: false })?.size > this.#maxBytes) truncateSync(this.#file);
      const line = parts.map((part) => (part instanceof Error ? part.stack ?? part.message : String(part))).join(' ');
      appendFileSync(this.#file, `${new Date().toISOString()} ${line}\n`);
    } catch {
      // Nothing sensible to do if even logging fails.
    }
  }
}
