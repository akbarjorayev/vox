import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Remembers the one running playback worker: { pid, port, token, status }.
export class StateStore {
  #file;
  #isAlive;

  constructor(file, isAlive = processIsAlive) {
    this.#file = file;
    this.#isAlive = isAlive;
  }

  write(state) {
    mkdirSync(dirname(this.#file), { recursive: true });
    writeFileSync(this.#file, JSON.stringify(state));
  }

  // Only the worker that wrote the state may remove it, so a late shutdown
  // cannot erase the state of the worker that replaced it.
  clear(ownerPid) {
    if (ownerPid !== undefined && this.#read()?.pid !== ownerPid) return;
    rmSync(this.#file, { force: true });
  }

  // The running worker's state, or null. A leftover file from a worker that
  // is gone is removed quietly.
  readActive() {
    const state = this.#read();
    if (!state) return null;
    if (this.#isAlive(state.pid)) return state;
    this.clear();
    return null;
  }

  #read() {
    try {
      return JSON.parse(readFileSync(this.#file, 'utf8'));
    } catch {
      return null;
    }
  }
}
